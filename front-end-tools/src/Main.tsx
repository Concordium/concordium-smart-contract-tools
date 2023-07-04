/* eslint-disable no-console */
import React, { useEffect, useState, ChangeEvent, PropsWithChildren, useCallback, useRef } from 'react';
import {
    WalletConnectionProps,
    useConnection,
    useConnect,
    useGrpcClient,
    TESTNET,
    MAINNET,
} from '@concordium/react-components';
import { Buffer } from 'buffer';
import {
    AccountAddress,
    ModuleReference,
    TransactionKindString,
    TransactionSummaryType,
    displayTypeSchemaTemplate,
    sha256,
    toBuffer,
    getInitContractParameterSchema,
} from '@concordium/web-sdk';
import { WalletConnectionTypeButton } from './WalletConnectorTypeButton';

import { initialize, deploy } from './writing_to_blockchain';

import { BROWSER_WALLET, REFRESH_INTERVAL } from './constants';

type TestBoxProps = PropsWithChildren<{
    header: string;
}>;

function TestBox({ header, children }: TestBoxProps) {
    return (
        <fieldset className="testBox">
            <legend>{header}</legend>
            <div className="testBoxFields">{children}</div>
            <br />
        </fieldset>
    );
}

interface ConnectionProps {
    walletConnectionProps: WalletConnectionProps;
    isTestnet: boolean;
}

export default function Main(props: ConnectionProps) {
    const { walletConnectionProps, isTestnet } = props;

    const { activeConnectorType, activeConnector, activeConnectorError, connectedAccounts, genesisHashes } =
        walletConnectionProps;

    const { connection, setConnection, account } = useConnection(connectedAccounts, genesisHashes);
    const { connect, isConnecting, connectError } = useConnect(activeConnector, setConnection);
    const client = useGrpcClient(isTestnet ? TESTNET : MAINNET);

    const [viewErrorAccountInfo, setViewErrorAccountInfo] = useState('');
    const [viewErrorModuleReference, setViewErrorModuleReference] = useState('');
    const [transactionErrorDeploy, setTransactionErrorDeploy] = useState('');
    const [transactionErrorInit, setTransactionErrorInit] = useState('');
    const [uploadError, setUploadError] = useState('');
    const [uploadError2, setUploadError2] = useState('');
    const [parsingError, setParsingError] = useState('');
    const [smartContractIndexError, setSmartContractIndexError] = useState('');
    const [moduleReferenceError, setModuleReferenceError] = useState('');

    const [accountExistsOnNetwork, setAccountExistsOnNetwork] = useState(true);
    const [moduleReferenceCalculated, setModuleReferenceCalculated] = useState('');
    const [moduleReferenceAlreadyDeployed, setModuleReferenceAlreadyDeployed] = useState(false);
    const [moduleReferenceDeployed, setModuleReferenceDeployed] = useState('');

    const [txHashDeploy, setTxHashDeploy] = useState('');
    const [txHashInit, setTxHashInit] = useState('');

    const [accountBalance, setAccountBalance] = useState('');
    const [inputParameter, setInputParameter] = useState('');
    const [initName, setInitName] = useState('');
    const [moduleReference, setModuleReference] = useState('');
    const [cCDAmount, setCCDAmount] = useState('');
    const [base64Module, setBase64Module] = useState('');
    const [base64Schema, setBase64Schema] = useState('');
    const [dropDown, setDropDown] = useState('number');
    const [smartContractIndex, setSmartContractIndex] = useState('');
    const [maxContractExecutionEnergy, setMaxContractExecutionEnergy] = useState('');
    const [checkedBoxElemenChecked, setCheckedBoxElemenChecked] = useState(false);
    const [contracts, setContracts] = useState<string[]>([]);
    const [inputParameterTemplate, setInputParameterTemplate] = useState('');

    const [isWaitingForTransaction, setWaitingForUser] = useState(false);
    const [hasInputParameter, setHasInputParameter] = useState(false);
    const [isPayable, setIsPayable] = useState(false);

    const moduleFileRef = useRef(null);
    const inputParameterDropDownRef = useRef(null);
    const contractNameDropDownRef = useRef(null);
    const schemaFileRef = useRef(null);
    const inputParameterTextAreaRef = useRef(null);
    const useModuleReferenceFromStep1Ref = useRef(null);
    const moduleReferenceRef = useRef(null);

    function arraysEqual(a: Uint8Array, b: Uint8Array) {
        if (a === b) return true;
        if (a == null || b == null) return false;
        if (a.length !== b.length) return false;

        for (let i = 0; i < a.length; i += 1) {
            if (a[i] !== b[i]) return false;
        }
        return true;
    }

    const changeModuleReferenceHandler = useCallback((event: ChangeEvent) => {
        setTransactionErrorInit('');
        const target = event.target as HTMLTextAreaElement;
        setModuleReference(target.value);
    }, []);

    const changeInputParameterDropDownHandler = useCallback(() => {
        setParsingError('');
        setInputParameter('');
        setTransactionErrorInit('');
        const e = inputParameterDropDownRef.current as unknown as HTMLSelectElement;
        const sel = e.selectedIndex;
        const { value } = e.options[sel];
        setDropDown(value);
    }, []);

    const changeSmarContractDropDownHandler = useCallback(() => {
        setTransactionErrorInit('');
        const e = contractNameDropDownRef.current as unknown as HTMLSelectElement;
        const sel = e.selectedIndex;
        const { value } = e.options[sel];
        setInitName(value);
    }, []);

    const changeCCDAmountHandler = useCallback((event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setCCDAmount(target.value);
    }, []);

    const changeMaxExecutionEnergyHandler = useCallback((event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setMaxContractExecutionEnergy(target.value);
    }, []);

    const changeInitNameHandler = useCallback((event: ChangeEvent) => {
        setTransactionErrorInit('');
        const target = event.target as HTMLTextAreaElement;
        setInitName(target.value);
    }, []);

    const changeInputParameterFieldHandler = useCallback((event: ChangeEvent) => {
        setParsingError('');
        setTransactionErrorInit('');
        const target = event.target as HTMLTextAreaElement;
        setInputParameter(target.value);
    }, []);

    const changeInputParameterTextAreaHandler = useCallback((event: ChangeEvent) => {
        setParsingError('');
        setTransactionErrorInit('');
        const inputTextArea = inputParameterTextAreaRef.current as unknown as HTMLTextAreaElement;
        inputTextArea?.setAttribute('style', `height:${inputTextArea.scrollHeight}px;overflow-y:hidden;`);
        const target = event.target as HTMLTextAreaElement;

        try {
            JSON.parse(target.value);
        } catch (e) {
            setParsingError((e as Error).message);
            return;
        }

        setInputParameter(JSON.stringify(JSON.parse(target.value)));
    }, []);

    // Refresh accountInfo periodically.
    // eslint-disable-next-line consistent-return
    useEffect(() => {
        if (connection && client && account) {
            const interval = setInterval(() => {
                console.log('refreshing_accountInfo');
                client
                    .getAccountInfo(new AccountAddress(account))
                    .then((value) => {
                        if (value !== undefined) {
                            setAccountBalance(value.accountAmount.toString());
                            setAccountExistsOnNetwork(true);
                        } else {
                            setAccountExistsOnNetwork(false);
                        }
                        setViewErrorAccountInfo('');
                    })
                    .catch((e) => {
                        setAccountBalance('');
                        setViewErrorAccountInfo((e as Error).message.replaceAll('%20', ' '));
                        setAccountExistsOnNetwork(false);
                    });
            }, REFRESH_INTERVAL.asMilliseconds());
            return () => clearInterval(interval);
        }
    }, [connection, account, client]);

    // Refresh moduleReference periodically.
    // eslint-disable-next-line consistent-return
    useEffect(() => {
        if (connection && client && account && txHashDeploy !== '') {
            const interval = setInterval(() => {
                console.log('refreshing_moduleReference');
                client
                    .getBlockItemStatus(txHashDeploy)
                    .then((report) => {
                        if (report !== undefined) {
                            setViewErrorModuleReference('');
                            if (
                                report.status === 'finalized' &&
                                report.outcome.summary.type === TransactionSummaryType.AccountTransaction &&
                                report.outcome.summary.transactionType === TransactionKindString.DeployModule
                            ) {
                                setModuleReferenceDeployed(report.outcome.summary.moduleDeployed.contents);
                            }
                        }
                    })
                    .catch((e) => {
                        setModuleReferenceDeployed('');
                        setViewErrorModuleReference((e as Error).message);
                    });
            }, REFRESH_INTERVAL.asMilliseconds());
            return () => clearInterval(interval);
        }
    }, [connection, account, client, txHashDeploy]);

    // Refresh smartContractIndex periodically.
    // eslint-disable-next-line consistent-return
    useEffect(() => {
        if (connection && client && account && txHashInit !== '') {
            const interval = setInterval(() => {
                console.log('refreshing_smartContractIndex');
                client
                    .getBlockItemStatus(txHashInit)
                    .then((report) => {
                        if (report !== undefined) {
                            setViewErrorModuleReference('');
                            if (report.status === 'finalized') {
                                if (
                                    report.outcome.summary.type === TransactionSummaryType.AccountTransaction &&
                                    report.outcome.summary.transactionType === TransactionKindString.InitContract
                                ) {
                                    setSmartContractIndex(
                                        report.outcome.summary.contractInitialized.address.index.toString()
                                    );
                                } else {
                                    setSmartContractIndexError('Contract initialization failed');
                                }
                            }
                        }
                    })
                    .catch((e) => {
                        setModuleReferenceDeployed('');
                        setViewErrorModuleReference((e as Error).message);
                    });
            }, REFRESH_INTERVAL.asMilliseconds());
            return () => clearInterval(interval);
        }
    }, [connection, account, client, txHashInit]);

    useEffect(() => {
        if (connection && client && account && moduleReferenceCalculated) {
            client
                .getModuleSource(new ModuleReference(moduleReferenceCalculated))
                .then((value) => {
                    if (value === undefined) {
                        setModuleReferenceAlreadyDeployed(false);
                    } else {
                        setModuleReferenceAlreadyDeployed(true);
                    }
                })
                .catch(() => {
                    setModuleReferenceAlreadyDeployed(false);
                });
        }
    }, [connection, account, client, moduleReferenceCalculated]);

    useEffect(() => {
        if (connection && client && account) {
            client
                .getAccountInfo(new AccountAddress(account))
                .then((value) => {
                    if (value !== undefined) {
                        setAccountBalance(value.accountAmount.toString());
                        setAccountExistsOnNetwork(true);
                    } else {
                        setAccountExistsOnNetwork(false);
                    }
                    setViewErrorAccountInfo('');
                })
                .catch((e) => {
                    setViewErrorAccountInfo((e as Error).message.replaceAll('%20', ' '));
                    setAccountBalance('');
                    setAccountExistsOnNetwork(false);
                });
        }
    }, [connection, account, client]);

    return (
        <main className="container">
            <div className="textCenter">
                <br />
                <WalletConnectionTypeButton
                    connectorType={BROWSER_WALLET}
                    connectorName="Browser Wallet"
                    setWaitingForUser={setWaitingForUser}
                    connection={connection}
                    {...walletConnectionProps}
                />
                {activeConnectorError && (
                    <p className="alert alert-danger" role="alert">
                        Connector Error: {activeConnectorError}.
                    </p>
                )}
                {!activeConnectorError && !isWaitingForTransaction && activeConnectorType && !activeConnector && (
                    <p>
                        <i>Loading connector...</i>
                    </p>
                )}
                {connectError && (
                    <p className="alert alert-danger" role="alert">
                        Connect Error: {connectError}.
                    </p>
                )}
                {!connection && !isWaitingForTransaction && activeConnectorType && activeConnector && (
                    <p>
                        <button className="btn btn-primary me-1" type="button" onClick={connect}>
                            {isConnecting && 'Connecting...'}
                            {!isConnecting && activeConnectorType === BROWSER_WALLET && 'Connect Browser Wallet'}
                        </button>
                    </p>
                )}
                {connection && !accountExistsOnNetwork && (
                    <>
                        <div className="alert alert-danger" role="alert">
                            Please ensure that your browser wallet is connected to network `
                            {walletConnectionProps.network.name}` and you have an account in that wallet that is
                            connected to this website.
                        </div>
                        <div className="alert alert-danger" role="alert">
                            Alternatively, if you intend to use `{isTestnet ? 'mainnet' : 'testnet'}`, switch the
                            network button at the top of this webpage.
                        </div>
                    </>
                )}
            </div>
            {account && (
                <div className="row">
                    {connection && account !== undefined && (
                        <div className="col-lg-12">
                            {viewErrorAccountInfo && (
                                <div className="alert alert-danger" role="alert">
                                    Error: {viewErrorAccountInfo}.
                                </div>
                            )}
                            {viewErrorModuleReference && (
                                <div className="alert alert-danger" role="alert">
                                    Error: {viewErrorModuleReference}.
                                </div>
                            )}
                            <br />
                            <div className="label">Connected account:</div>
                            <div>
                                <a
                                    className="link"
                                    href={`https://${
                                        isTestnet ? `testnet.` : ``
                                    }ccdscan.io/?dcount=1&dentity=account&daddress=${account}`}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    {account}
                                </a>
                            </div>
                            <br />
                            <div className="label">Your account balance:</div>
                            <div>{accountBalance.replace(/(\d)(?=(\d\d\d\d\d\d)+(?!\d))/g, '$1.')} CCD</div>
                            <TestBox header="Step 1: Deploy Smart Contract Module">
                                <label className="field">
                                    Upload Smart Contract Module File (e.g. myContract.wasm.v1):
                                    <br />
                                    <br />
                                    <input
                                        className="btn btn-primary"
                                        type="file"
                                        id="moduleFile"
                                        ref={moduleFileRef}
                                        accept=".wasm,.wasm.v0,.wasm.v1"
                                        onChange={async () => {
                                            setUploadError('');
                                            setModuleReferenceDeployed('');
                                            setTransactionErrorDeploy('');
                                            setTxHashDeploy('');

                                            const hTMLInputElement =
                                                moduleFileRef.current as unknown as HTMLInputElement;

                                            if (
                                                hTMLInputElement.files !== undefined &&
                                                hTMLInputElement.files !== null &&
                                                hTMLInputElement.files.length > 0
                                            ) {
                                                const file = hTMLInputElement.files[0];
                                                const arrayBuffer = await file.arrayBuffer();

                                                // Concordium's tooling create versioned modules e.g. `.wasm.v1` now.
                                                // Unversioned modules `.wasm` cannot be created by Concordium's tooling anymore.
                                                // If the module is versioned, the first 8 bytes are the version, followed by the `magicValue` below.
                                                // If the module is an old unversioned one, the module starts with the `magicValue` below.
                                                const magicValue = new Uint8Array([0x00, 0x61, 0x73, 0x6d]);
                                                let uploadedModuleFirst4Bytes = new Uint8Array([]);

                                                if (arrayBuffer.byteLength >= 4) {
                                                    uploadedModuleFirst4Bytes = new Uint8Array(arrayBuffer).subarray(
                                                        0,
                                                        4
                                                    );
                                                } else {
                                                    setUploadError(`You might have not uploaded a Concordium module.`);
                                                }

                                                // If we have an unversioned module, we remove no bytes.
                                                // If we have a versioned module, we remove 8 bytes (remove the versioned 8 bytes at the beginning)
                                                const slice = arraysEqual(uploadedModuleFirst4Bytes, magicValue)
                                                    ? 0
                                                    : 8;

                                                let wasmModule;
                                                try {
                                                    wasmModule = await WebAssembly.compile(arrayBuffer.slice(slice));
                                                } catch (e) {
                                                    setUploadError(
                                                        `You might have not uploaded a Concordium module. Original error: ${
                                                            (e as Error).message
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

                                                    const typeSchema = new Uint8Array(customSection[0]);

                                                    const typeSchemaBase64 = btoa(
                                                        new Uint8Array(typeSchema).reduce((data, byte) => {
                                                            return data + String.fromCharCode(byte);
                                                        }, '')
                                                    );

                                                    const inputParamterTypeSchema = getInitContractParameterSchema(
                                                        toBuffer(typeSchemaBase64, 'base64'),
                                                        contractNames[0],
                                                        2
                                                    );

                                                    console.log(displayTypeSchemaTemplate(inputParamterTypeSchema));

                                                    setInputParameterTemplate(
                                                        JSON.stringify(
                                                            displayTypeSchemaTemplate(inputParamterTypeSchema)
                                                        )
                                                    );
                                                }

                                                const module = btoa(
                                                    new Uint8Array(arrayBuffer).reduce((data, byte) => {
                                                        return data + String.fromCharCode(byte);
                                                    }, '')
                                                );

                                                setBase64Module(module);
                                                setModuleReferenceCalculated(
                                                    Buffer.from(sha256([new Uint8Array(arrayBuffer)])).toString('hex')
                                                );
                                            } else {
                                                setUploadError('Upload module file is undefined');
                                            }
                                        }}
                                    />
                                    <br />
                                    <br />
                                </label>
                                {uploadError !== '' && (
                                    <div className="alert alert-danger" role="alert">
                                        Error: {uploadError}.
                                    </div>
                                )}
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
                                        {moduleReferenceAlreadyDeployed && (
                                            <div className="alert alert-danger" role="alert">
                                                Module reference already deployed.
                                            </div>
                                        )}
                                        <br />
                                        {!moduleReferenceAlreadyDeployed && (
                                            <button
                                                className="btn btn-primary"
                                                type="button"
                                                onClick={() => {
                                                    setTxHashDeploy('');
                                                    setTransactionErrorDeploy('');
                                                    const tx = deploy(connection, account, base64Module);
                                                    tx.then((txHash) => {
                                                        setModuleReferenceDeployed('');
                                                        setTxHashDeploy(txHash);
                                                    }).catch((err: Error) =>
                                                        setTransactionErrorDeploy((err as Error).message)
                                                    );
                                                }}
                                            >
                                                Deploy smart contract module
                                            </button>
                                        )}
                                        <br />
                                        <br />
                                    </>
                                )}
                                {!txHashDeploy && transactionErrorDeploy && (
                                    <div className="alert alert-danger" role="alert">
                                        Error: {transactionErrorDeploy}.
                                    </div>
                                )}
                                {txHashDeploy && (
                                    <>
                                        Transaction hash (May take a moment to finalize): {}
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
                            </TestBox>
                            <TestBox header="Step 2: Initialize Smart Contract">
                                <br />
                                <br />
                                <div className="checkbox-wrapper">
                                    <label>
                                        <input
                                            type="checkbox"
                                            id="useModuleReferenceFromStep1"
                                            ref={useModuleReferenceFromStep1Ref}
                                            onChange={() => {
                                                setModuleReferenceError('');
                                                setModuleReference('');
                                                setInitName('');
                                                const checkboxElement =
                                                    useModuleReferenceFromStep1Ref.current as unknown as HTMLInputElement;

                                                setCheckedBoxElemenChecked(checkboxElement.checked);

                                                const element =
                                                    moduleReferenceRef.current as unknown as HTMLTextAreaElement;

                                                element.value = '';

                                                if (
                                                    checkboxElement.checked &&
                                                    moduleReferenceDeployed === '' &&
                                                    moduleReferenceCalculated === ''
                                                ) {
                                                    setModuleReferenceError('Module reference is not set in step 1');
                                                }

                                                if (
                                                    checkboxElement.checked &&
                                                    (moduleReferenceDeployed !== '' || moduleReferenceCalculated !== '')
                                                ) {
                                                    element.value =
                                                        moduleReferenceDeployed !== ''
                                                            ? moduleReferenceDeployed
                                                            : moduleReferenceCalculated;

                                                    setModuleReference(
                                                        moduleReferenceDeployed !== ''
                                                            ? moduleReferenceDeployed
                                                            : moduleReferenceCalculated
                                                    );
                                                    setInitName(contracts[0]);
                                                }
                                            }}
                                        />
                                        <span>{' Use Module from Step 1'}</span>
                                    </label>
                                </div>
                                {moduleReferenceError && (
                                    <div className="alert alert-danger" role="alert">
                                        Error: {moduleReferenceError}.
                                    </div>
                                )}
                                <label className="field">
                                    Module Reference:
                                    <br />
                                    <input
                                        className="inputFieldStyle"
                                        id="moduleReference"
                                        ref={moduleReferenceRef}
                                        type="text"
                                        placeholder="91225f9538ac2903466cc4ab07b6eb607a2cd349549f357dfdf4e6042dde0693"
                                        onChange={changeModuleReferenceHandler}
                                    />
                                </label>
                                <label className="field">
                                    Max Execution Energy:
                                    <br />
                                    <input
                                        className="inputFieldStyle"
                                        id="maxContractExecutionEnergy"
                                        type="text"
                                        placeholder="30000"
                                        onChange={changeMaxExecutionEnergyHandler}
                                    />
                                </label>
                                {checkedBoxElemenChecked &&
                                contracts.length > 0 &&
                                (moduleReferenceDeployed !== '' || moduleReferenceCalculated !== '') ? (
                                    <label className="field">
                                        Smart Contract Name:
                                        <br />
                                        <select
                                            className="dropDownStyle"
                                            name="contractNameDropDown"
                                            id="contractNameDropDown"
                                            ref={contractNameDropDownRef}
                                            onChange={changeSmarContractDropDownHandler}
                                        >
                                            {contracts?.map((contract) => (
                                                <option key={contract}>{contract}</option>
                                            ))}
                                        </select>
                                    </label>
                                ) : (
                                    <label className="field">
                                        Smart Contract Name:
                                        <br />
                                        <input
                                            className="inputFieldStyle"
                                            id="initName"
                                            type="text"
                                            placeholder="myContract"
                                            onChange={changeInitNameHandler}
                                        />
                                    </label>
                                )}
                                <br />
                                <br />
                                <div className="checkbox-wrapper">
                                    <label>
                                        <input
                                            type="checkbox"
                                            onChange={() => {
                                                setIsPayable(!isPayable);
                                            }}
                                        />
                                        <span>{' Is Payable'}</span>
                                    </label>
                                </div>
                                {isPayable && (
                                    <div className="testBox">
                                        <label className="field">
                                            CCD amount (micro):
                                            <br />
                                            <input
                                                className="inputFieldStyle"
                                                id="CCDAmount"
                                                type="text"
                                                placeholder="1000000"
                                                onChange={changeCCDAmountHandler}
                                            />
                                        </label>
                                    </div>
                                )}
                                <br />
                                <br />
                                <label>
                                    <input
                                        type="checkbox"
                                        onChange={() => {
                                            setParsingError('');
                                            setInputParameter('');
                                            setBase64Schema('');
                                            setTransactionErrorInit('');
                                            setDropDown('number');
                                            setHasInputParameter(!hasInputParameter);
                                        }}
                                    />
                                    <span>{' Has Input Parameter'}</span>
                                </label>
                                <br />

                                {hasInputParameter && (
                                    <div className="testBox">
                                        <label className="field">
                                            Upload Smart Contract Module Schema File (e.g. schema.bin):
                                            <br />
                                            <br />
                                            <input
                                                className="btn btn-primary"
                                                type="file"
                                                id="schemaFile"
                                                ref={schemaFileRef}
                                                accept=".bin"
                                                onChange={async () => {
                                                    setUploadError('');

                                                    const hTMLInputElement =
                                                        schemaFileRef.current as unknown as HTMLInputElement;

                                                    if (
                                                        hTMLInputElement.files !== undefined &&
                                                        hTMLInputElement.files !== null &&
                                                        hTMLInputElement.files.length > 0
                                                    ) {
                                                        const file = hTMLInputElement.files[0];
                                                        const arrayBuffer = await file.arrayBuffer();

                                                        const schema = btoa(
                                                            new Uint8Array(arrayBuffer).reduce((data, byte) => {
                                                                return data + String.fromCharCode(byte);
                                                            }, '')
                                                        );

                                                        setBase64Schema(schema);
                                                    } else {
                                                        setUploadError2('Upload schema file is undefined');
                                                    }
                                                }}
                                            />
                                            <br />
                                            <br />
                                        </label>
                                        {uploadError2 !== '' && (
                                            <div className="alert alert-danger" role="alert">
                                                Error: {uploadError2}.
                                            </div>
                                        )}
                                        <br />
                                        {base64Schema && (
                                            <div className="actionResultBox">
                                                Schema in base64:
                                                <div>{base64Schema.toString().slice(0, 30)} ...</div>
                                            </div>
                                        )}
                                        <label className="field">
                                            Select input parameter type:
                                            <br />
                                            <select
                                                className="dropDownStyle"
                                                name="inputParameterDropDown"
                                                id="inputParameterDropDown"
                                                ref={inputParameterDropDownRef}
                                                onChange={changeInputParameterDropDownHandler}
                                            >
                                                <option value="number">number</option>
                                                <option value="string">string</option>
                                                <option value="object">JSON object</option>
                                                <option value="array">array</option>
                                            </select>
                                        </label>
                                        <br />
                                        {(dropDown === 'object' || dropDown === 'array') && (
                                            <label className="field">
                                                Add your input parameter ({dropDown}):
                                                <br />
                                                {dropDown === 'array' && (
                                                    <textarea
                                                        id="inputParameterTextArea"
                                                        ref={inputParameterTextAreaRef}
                                                        onChange={changeInputParameterTextAreaHandler}
                                                    >
                                                        Examples:&#10;&#10; [1,2,3] or&#10;&#10;
                                                        [&#34;abc&#34;,&#34;def&#34;] or&#10;&#10; [&#123;
                                                        &#34;myFieldKey&#34;:&#34;myFieldValue&#34;&#125;]
                                                    </textarea>
                                                )}
                                                {dropDown === 'object' && (
                                                    <textarea
                                                        id="inputParameterTextArea"
                                                        ref={inputParameterTextAreaRef}
                                                        onChange={changeInputParameterTextAreaHandler}
                                                    >
                                                        {inputParameterTemplate ||
                                                            '&#123;&#10; &#34;myStringField&#34;:&#34;FieldValue&#34;,&#10;&#34;myNumberField&#34;:4,&#10; &#34;myArray&#34;:[1,2,3],&#10;&#34;myObject&#34;:&#123;&#10;&#9;&#9;&#34;myField1&#34;:&#34;FieldValue&#34;&#10;&#9;&#125;&#10; &#125;'}
                                                    </textarea>
                                                )}
                                            </label>
                                        )}
                                        {(dropDown === 'string' || dropDown === 'number') && (
                                            <label className="field">
                                                Add your input parameter ({dropDown}):
                                                <br />
                                                <input
                                                    className="inputFieldStyle"
                                                    id="inputParameterField"
                                                    type="text"
                                                    placeholder={dropDown === 'string' ? 'myString' : '1000000'}
                                                    onChange={changeInputParameterFieldHandler}
                                                />
                                            </label>
                                        )}
                                        {parsingError && (
                                            <div className="alert alert-danger" role="alert">
                                                Error: {parsingError}.
                                            </div>
                                        )}
                                    </div>
                                )}
                                <br />
                                <br />
                                <button
                                    className="btn btn-primary"
                                    type="button"
                                    onClick={() => {
                                        setTxHashInit('');
                                        setSmartContractIndexError('');
                                        setSmartContractIndex('');
                                        setTransactionErrorInit('');
                                        const tx = initialize(
                                            connection,
                                            account,
                                            moduleReference,
                                            inputParameter,
                                            initName,
                                            hasInputParameter,
                                            base64Schema,
                                            dropDown,
                                            maxContractExecutionEnergy,
                                            cCDAmount
                                        );
                                        tx.then(setTxHashInit).catch((err: Error) =>
                                            setTransactionErrorInit((err as Error).message)
                                        );
                                    }}
                                >
                                    Initialize Smart Contract
                                </button>
                                <br />
                                <br />
                                {!txHashInit && transactionErrorInit && (
                                    <div className="alert alert-danger" role="alert">
                                        Error: {transactionErrorInit}.
                                    </div>
                                )}
                                {txHashInit && (
                                    <>
                                        Transaction hash (May take a moment to finalize): {}
                                        <a
                                            className="link"
                                            target="_blank"
                                            rel="noreferrer"
                                            href={`https://${
                                                isTestnet ? `testnet.` : ``
                                            }ccdscan.io/?dcount=1&dentity=transaction&dhash=${txHashInit}`}
                                        >
                                            {txHashInit}
                                        </a>
                                    </>
                                )}
                                <br />
                                <br />
                                {smartContractIndexError !== '' && (
                                    <div className="alert alert-danger" role="alert">
                                        Error: {smartContractIndexError}.
                                    </div>
                                )}
                                {smartContractIndex !== '' && (
                                    <div className="actionResultBox">
                                        Smart Contract Inedex:
                                        <div>{smartContractIndex}</div>
                                    </div>
                                )}
                            </TestBox>
                            <br />
                            <a
                                href="https://developer.concordium.software/en/mainnet/smart-contracts/guides/on-chain-index.html"
                                target="_blank"
                                rel="noreferrer"
                            >
                                Learn more about how deployment and initialization works on Concordium.
                            </a>
                            <br />
                            <br />
                            <a
                                href="https://github.com/Concordium/concordium-smart-contract-tools/tree/main/front-end-tools"
                                target="_blank"
                                rel="noreferrer"
                            >
                                Front end source code
                            </a>
                            <br />
                        </div>
                    )}
                </div>
            )}
        </main>
    );
}
