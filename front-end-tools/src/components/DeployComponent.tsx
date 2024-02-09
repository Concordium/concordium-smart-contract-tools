import React, { useEffect, useState } from 'react';
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
    TransactionHash,
    AccountAddress,
} from '@concordium/web-sdk';

import { TxHashLink } from './CCDScanLinks';
import Box from './Box';
import { deploy } from '../writing_to_blockchain';
import { arraysEqual } from '../utils';
import { REFRESH_INTERVAL } from '../constants';

interface ConnectionProps {
    account: string;
    connection: WalletConnection;
    client: ConcordiumGRPCClient | undefined;
    isTestnet: boolean;
    setModuleReferenceCalculated: (moduleReferenceCalculated: ModuleReference.Type) => void;
    moduleReferenceCalculated: ModuleReference.Type | undefined;
}

/**
 * A component that manages the input fields and corresponding state to deploy a new smart contract wasm module on chain.
 *  This components creates a `DeployModule` transaction.
 */
export default function DeployComponenet(props: ConnectionProps) {
    const { isTestnet, client, connection, account, setModuleReferenceCalculated, moduleReferenceCalculated } = props;

    type FormType = {
        file: FileList | undefined;
    };
    const form = useForm<FormType>({ mode: 'all' });

    const [transactionErrorDeploy, setTransactionErrorDeploy] = useState<string | undefined>(undefined);
    const [uploadError, setUploadError] = useState<string | undefined>(undefined);
    const [isReproducibleBuild, setIsReproducibleBuild] = useState<boolean | undefined>(undefined);
    const [isModuleReferenceAlreadyDeployedStep1, setIsModuleReferenceAlreadyDeployedStep1] = useState(false);
    const [txHashDeploy, setTxHashDeploy] = useState<string | undefined>(undefined);
    const [base64Module, setBase64Module] = useState<string | undefined>(undefined);
    const [transactionOutcome, setTransactionOutcome] = useState<string | undefined>(undefined);

    // Refresh moduleReference periodically.
    // eslint-disable-next-line consistent-return
    useEffect(() => {
        if (connection && client && txHashDeploy !== undefined) {
            const interval = setInterval(() => {
                client
                    .getBlockItemStatus(TransactionHash.fromHexString(txHashDeploy))
                    .then((report) => {
                        if (report !== undefined && report.status === 'finalized') {
                            if (
                                report.outcome.summary.type === TransactionSummaryType.AccountTransaction &&
                                report.outcome.summary.transactionType === TransactionKindString.DeployModule
                            ) {
                                setTransactionOutcome('Success');
                                clearInterval(interval);
                            } else {
                                setTransactionOutcome('Fail');
                                clearInterval(interval);
                            }
                        }
                    })
                    .catch((e) => {
                        setTransactionOutcome(`Fail; Error: ${(e as Error).message}`);
                        clearInterval(interval);
                    });
            }, REFRESH_INTERVAL.asMilliseconds());
            return () => clearInterval(interval);
        }
    }, [connection, client, txHashDeploy]);

    useEffect(() => {
        if (connection && client && moduleReferenceCalculated) {
            client
                .getModuleSource(moduleReferenceCalculated)
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
    }, [connection, client, moduleReferenceCalculated]);

    function onSubmit() {
        setTxHashDeploy(undefined);
        setTransactionErrorDeploy(undefined);
        setTransactionOutcome(undefined);

        // Send deploy transaction

        const tx = deploy(connection, AccountAddress.fromBase58(account), base64Module);
        tx.then((txHash) => {
            setTxHashDeploy(txHash);
        }).catch((err: Error) => setTransactionErrorDeploy((err as Error).message));
    }

    return (
        <Box header="Step 1: Deploy Smart Contract Module">
            <Form onSubmit={form.handleSubmit(onSubmit)}>
                <Form.Group className="mb-3">
                    <Form.Label>Upload Smart Contract Module File (e.g. myContract.wasm.v1)</Form.Label>
                    <Form.Control
                        type="file"
                        accept=".wasm,.v0,.v1"
                        {...form.register('file')}
                        onChange={async (e) => {
                            const register = form.register('file');

                            register.onChange(e);

                            setUploadError(undefined);
                            setTransactionErrorDeploy(undefined);
                            setTxHashDeploy(undefined);

                            const files = form.getValues('file');

                            if (files !== undefined && files !== null && files.length > 0) {
                                const file = files[0];
                                const arrayBuffer = await file.arrayBuffer();

                                // Use `reduce` to be able to convert large modules.
                                const module = btoa(
                                    new Uint8Array(arrayBuffer).reduce(
                                        (data, byte) => data + String.fromCharCode(byte),
                                        ''
                                    )
                                );

                                setBase64Module(module);
                                setModuleReferenceCalculated(
                                    ModuleReference.fromBuffer(Buffer.from(sha256([new Uint8Array(arrayBuffer)])))
                                );

                                // Concordium's tooling create versioned modules e.g. `.wasm.v1` now.
                                // Unversioned modules `.wasm` cannot be created by Concordium's tooling anymore.
                                // If the module is versioned, the first 4 bytes are the version, the next 4 bytes are the length, followed by the `magicValue` below.
                                // If the module is an old unversioned one, the module starts with the `magicValue` below.
                                // The `magicValue` is the magic value for Wasm modules as specified by the Wasm spec.
                                const magicValue = new Uint8Array([0x00, 0x61, 0x73, 0x6d]);
                                let uploadedModuleFirst4Bytes = new Uint8Array([]);

                                if (arrayBuffer.byteLength >= 4) {
                                    uploadedModuleFirst4Bytes = new Uint8Array(arrayBuffer).subarray(0, 4);
                                } else {
                                    setUploadError(
                                        `You might have not uploaded a valid Wasm module. Byte length of a Wasm module needs to be at least 4.`
                                    );
                                }

                                // If we have an unversioned module, we remove no bytes.
                                // If we have a versioned module, we remove 8 bytes at the beginning (version and length information).
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
                                    // Check if the module was built as a reproducible build.
                                    const buildInfoSection = WebAssembly.Module.customSections(
                                        wasmModule,
                                        'concordium-build-info'
                                    );
                                    setIsReproducibleBuild(buildInfoSection.length !== 0);
                                } else {
                                    setUploadError('Upload module file is undefined');
                                }
                            }
                        }}
                    />
                    <Form.Text />
                </Form.Group>
                {uploadError !== undefined && <Alert variant="danger"> Error: {uploadError}. </Alert>}
                {isReproducibleBuild === false && (
                    <Alert variant="warning">
                        Warning: The module does not have embedded build information. It will likely not be possible to
                        match this module to source code. See the{' '}
                        <a href="https://docs.rs/crate/cargo-concordium/latest">cargo-concordium documentation</a> for
                        more information.
                    </Alert>
                )}
                <br />
                {base64Module && moduleReferenceCalculated && (
                    <>
                        <div className="actionResultBox">
                            Calculated module reference:
                            <div>{moduleReferenceCalculated.moduleRef}</div>
                        </div>
                        <div className="actionResultBox">
                            Module in base64:
                            <div>{base64Module.toString().slice(0, 30)} ...</div>
                        </div>
                        {isModuleReferenceAlreadyDeployedStep1 && (
                            <Alert variant="warning">Module is already deployed.</Alert>
                        )}
                        <br />
                        {!isModuleReferenceAlreadyDeployedStep1 && (
                            <Button variant="primary" type="submit">
                                Deploy smart contract module
                            </Button>
                        )}
                        <br />
                        <br />
                    </>
                )}
            </Form>

            {!txHashDeploy && transactionErrorDeploy && (
                <Alert variant="danger"> Error: {transactionErrorDeploy}. </Alert>
            )}
            {txHashDeploy && (
                <TxHashLink
                    txHash={txHashDeploy}
                    isTestnet={isTestnet}
                    message="The outcome of the transaction will be displayed below."
                />
            )}
            {transactionOutcome === 'Success' && (
                <>
                    <br />
                    <div className="actionResultBox">
                        Outcome of transaction:
                        <div>{transactionOutcome}</div>
                    </div>
                </>
            )}
            {transactionOutcome !== undefined && transactionOutcome !== 'Success' && (
                <>
                    <br />
                    <div> Outcome of transaction:</div>
                    <br />
                    <Alert variant="danger">Error: {transactionOutcome}. </Alert>
                </>
            )}
        </Box>
    );
}
