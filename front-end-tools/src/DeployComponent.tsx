/* eslint-disable no-console */
import React, { useEffect, useState, PropsWithChildren } from 'react';
import { useForm } from 'react-hook-form';
import { Alert, Button, Form } from 'react-bootstrap';
import { Buffer } from 'buffer';

import { WalletConnection } from '@concordium/react-components';
import {
    ModuleReference,
    ConcordiumGRPCClient,
    sha256,
    TransactionSummaryType,
    TransactionKindString,
} from '@concordium/web-sdk';

import { deploy } from './writing_to_blockchain';
import { arraysEqual } from './utils';
import { REFRESH_INTERVAL } from './constants';

type BoxProps = PropsWithChildren<{
    header: string;
}>;

function Box({ header, children }: BoxProps) {
    return (
        <fieldset className="box">
            <legend>{header}</legend>
            <div className="boxFields">{children}</div>
            <br />
        </fieldset>
    );
}

interface ConnectionProps {
    account: string;
    connection: WalletConnection;
    client: ConcordiumGRPCClient | undefined;
    isTestnet: boolean;
    setContracts: (arg0: string[]) => void;
    setEmbeddedModuleSchemaBase64Init: (arg0: string) => void;
    setModuleReferenceDeployed: (arg0: string | undefined) => void;
    setModuleReferenceCalculated: (arg0: string) => void;
    moduleReferenceDeployed: string | undefined;
    moduleReferenceCalculated: string | undefined;
}

export default function DeployComponenet(props: ConnectionProps) {
    const {
        isTestnet,
        client,
        connection,
        account,
        setContracts,
        setModuleReferenceDeployed,
        moduleReferenceDeployed,
        setModuleReferenceCalculated,
        moduleReferenceCalculated,
        setEmbeddedModuleSchemaBase64Init,
    } = props;

    const deployForm = useForm<{
        file: FileList | undefined;
    }>();

    const [transactionErrorDeploy, setTransactionErrorDeploy] = useState<string | undefined>(undefined);
    const [uploadError, setUploadError] = useState<string | undefined>(undefined);
    const [isModuleReferenceAlreadyDeployedStep1, setIsModuleReferenceAlreadyDeployedStep1] = useState(false);
    const [txHashDeploy, setTxHashDeploy] = useState<string | undefined>(undefined);
    const [base64Module, setBase64Module] = useState<string | undefined>(undefined);
    const [viewErrorModuleReference, setViewErrorModuleReference] = useState<string | undefined>(undefined);

    // Refresh moduleReference periodically.
    // eslint-disable-next-line consistent-return
    useEffect(() => {
        if (connection && client && account && txHashDeploy !== undefined) {
            const interval = setInterval(() => {
                console.log('refreshing_moduleReference');
                client
                    .getBlockItemStatus(txHashDeploy)
                    .then((report) => {
                        if (report !== undefined) {
                            setViewErrorModuleReference(undefined);
                            if (
                                report.status === 'finalized' &&
                                report.outcome.summary.type === TransactionSummaryType.AccountTransaction &&
                                report.outcome.summary.transactionType === TransactionKindString.DeployModule
                            ) {
                                setModuleReferenceDeployed(report.outcome.summary.moduleDeployed.contents);
                                clearInterval(interval);
                            }
                        }
                    })
                    .catch((e) => {
                        setModuleReferenceDeployed(undefined);
                        setViewErrorModuleReference((e as Error).message);
                        clearInterval(interval);
                    });
            }, REFRESH_INTERVAL.asMilliseconds());
        }
    }, [connection, account, client, txHashDeploy]);

    useEffect(() => {
        if (connection && client && account && moduleReferenceCalculated) {
            client
                .getModuleSource(new ModuleReference(moduleReferenceCalculated))
                .then((value) => {
                    if (value === undefined) {
                        setIsModuleReferenceAlreadyDeployedStep1(false);
                    } else {
                        setIsModuleReferenceAlreadyDeployedStep1(true);
                    }
                })
                .catch(() => {
                    setIsModuleReferenceAlreadyDeployedStep1(false);
                });
        }
    }, [connection, account, client, moduleReferenceCalculated]);

    return (
        <Box header="Step 1: Deploy Smart Contract Module">
            <Form>
                <Form.Group className="mb-3">
                    <Form.Label>Upload Smart Contract Module File (e.g. myContract.wasm.v1)</Form.Label>
                    <Form.Control
                        type="file"
                        accept=".wasm,.wasm.v0,.wasm.v1"
                        {...deployForm.register('file')}
                        onChange={async (e) => {
                            const register = deployForm.register('file');

                            register.onChange(e);

                            setUploadError(undefined);
                            setModuleReferenceDeployed(undefined);
                            setTransactionErrorDeploy(undefined);
                            setTxHashDeploy(undefined);

                            const files = deployForm.getValues('file');

                            if (files !== undefined && files !== null && files.length > 0) {
                                const file = files[0];
                                const arrayBuffer = await file.arrayBuffer();

                                const module = btoa(
                                    new Uint8Array(arrayBuffer).reduce((data, byte) => {
                                        return data + String.fromCharCode(byte);
                                    }, '')
                                );

                                setBase64Module(module);
                                setModuleReferenceCalculated(
                                    Buffer.from(sha256([new Uint8Array(arrayBuffer)])).toString('hex')
                                );

                                // Concordium's tooling create versioned modules e.g. `.wasm.v1` now.
                                // Unversioned modules `.wasm` cannot be created by Concordium's tooling anymore.
                                // If the module is versioned, the first 8 bytes are the version, followed by the `magicValue` below.
                                // If the module is an old unversioned one, the module starts with the `magicValue` below.
                                const magicValue = new Uint8Array([0x00, 0x61, 0x73, 0x6d]);
                                let uploadedModuleFirst4Bytes = new Uint8Array([]);

                                if (arrayBuffer.byteLength >= 4) {
                                    uploadedModuleFirst4Bytes = new Uint8Array(arrayBuffer).subarray(0, 4);
                                } else {
                                    setUploadError(`You might have not uploaded a Concordium module.`);
                                }

                                // If we have an unversioned module, we remove no bytes.
                                // If we have a versioned module, we remove 8 bytes (remove the versioned 8 bytes at the beginning)
                                const slice = arraysEqual(uploadedModuleFirst4Bytes, magicValue) ? 0 : 8;

                                let wasmModule;
                                try {
                                    wasmModule = await WebAssembly.compile(arrayBuffer.slice(slice));
                                } catch (err) {
                                    setUploadError(
                                        `You might have not uploaded a Concordium module. Original error: ${
                                            (err as Error).message
                                        }`
                                    );
                                }

                                if (wasmModule) {
                                    const moduleFunctions = WebAssembly.Module.exports(wasmModule);

                                    const contractNames = [];
                                    for (let i = 0; i < moduleFunctions.length; i += 1) {
                                        if (moduleFunctions[i].name.slice(0, 5) === 'init_') {
                                            contractNames.push(moduleFunctions[i].name.slice(5));
                                        }
                                    }
                                    setContracts(contractNames);

                                    const customSection = WebAssembly.Module.customSections(
                                        wasmModule,
                                        'concordium-schema'
                                    );

                                    const schema = new Uint8Array(customSection[0]);

                                    const moduleSchemaBase64Embedded = btoa(
                                        new Uint8Array(schema).reduce((data, byte) => {
                                            return data + String.fromCharCode(byte);
                                        }, '')
                                    );

                                    setEmbeddedModuleSchemaBase64Init(moduleSchemaBase64Embedded);
                                } else {
                                    setUploadError('Upload module file is undefined');
                                }
                            }
                        }}
                    />
                    <Form.Text />
                </Form.Group>
            </Form>

            {uploadError !== undefined && <Alert variant="danger"> Error: {uploadError}. </Alert>}
            <br />
            {base64Module && moduleReferenceCalculated && (
                <>
                    <div className="actionResultBox">
                        Calculated module reference:
                        <div>{moduleReferenceCalculated}</div>
                    </div>
                    <div className="actionResultBox">
                        Module in base64:
                        <div>{base64Module.toString().slice(0, 30)} ...</div>
                    </div>
                    {isModuleReferenceAlreadyDeployedStep1 && (
                        <Alert variant="warning">Module reference already deployed.</Alert>
                    )}
                    <br />
                    {!isModuleReferenceAlreadyDeployedStep1 && (
                        <Button
                            variant="primary"
                            type="button"
                            onClick={deployForm.handleSubmit(() => {
                                setTxHashDeploy(undefined);
                                setTransactionErrorDeploy(undefined);
                                const tx = deploy(connection, account, base64Module);
                                tx.then((txHash) => {
                                    setModuleReferenceDeployed(undefined);
                                    setTxHashDeploy(txHash);
                                }).catch((err: Error) => setTransactionErrorDeploy((err as Error).message));
                            })}
                        >
                            Deploy smart contract module
                        </Button>
                    )}
                    <br />
                    <br />
                </>
            )}
            {!txHashDeploy && transactionErrorDeploy && (
                <Alert variant="danger"> Error: {transactionErrorDeploy}. </Alert>
            )}
            {txHashDeploy && (
                <>
                    <div>
                        Transaction hash:{' '}
                        <a
                            className="link"
                            target="_blank"
                            rel="noreferrer"
                            href={`https://${
                                isTestnet ? `testnet.` : ``
                            }ccdscan.io/?dcount=1&dentity=transaction&dhash=${txHashDeploy}`}
                        >
                            {txHashDeploy}
                        </a>
                    </div>
                    <br />
                    <div>
                        CCDScan will take a moment to pick up the above transaction, hence the above link will work in a
                        bit.
                    </div>
                    <div>Deployed module reference will appear below once the transaction is finalized.</div>
                </>
            )}
            {moduleReferenceDeployed && (
                <>
                    <br />
                    <br />
                    <div className="actionResultBox">
                        Module Reference deployed:
                        <div>{moduleReferenceDeployed}</div>
                    </div>
                </>
            )}
            {viewErrorModuleReference && <Alert variant="danger"> Error: {viewErrorModuleReference}. </Alert>}
        </Box>
    );
}
