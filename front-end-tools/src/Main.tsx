/* eslint-disable no-console */
import React, { useEffect, useState, ChangeEvent, PropsWithChildren, useCallback, useRef } from 'react';
import { Buffer } from 'buffer';

import {
    WalletConnectionProps,
    useConnection,
    useConnect,
    useGrpcClient,
    TESTNET,
    MAINNET,
    useWalletConnectorSelector,
} from '@concordium/react-components';
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

import { initialize, deploy } from './writing_to_blockchain';
import { getObjectExample, getArrayExample, arraysEqual } from './utils';
import WriteComponent from './WriteComponent';
import ReadComponent from './ReadComponent';

import { BROWSER_WALLET, REFRESH_INTERVAL } from './constants';

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
    walletConnectionProps: WalletConnectionProps;
    isTestnet: boolean;
}

interface FunctionState {
    initFunction: undefined | string;
    readFunction: undefined | string;
    writeFunction: undefined | string;
}

export default function Main(props: ConnectionProps) {
    const { walletConnectionProps, isTestnet } = props;
    const { activeConnectorType, activeConnector, activeConnectorError, connectedAccounts, genesisHashes } =
        walletConnectionProps;
    const { connection, setConnection, account } = useConnection(connectedAccounts, genesisHashes);
    const { isConnected, select } = useWalletConnectorSelector(BROWSER_WALLET, connection, {
        ...walletConnectionProps,
    });

    const { connect, connectError } = useConnect(activeConnector, setConnection);

    const client = useGrpcClient(isTestnet ? TESTNET : MAINNET);

    const [viewErrorAccountInfo, setViewErrorAccountInfo] = useState<string | undefined>(undefined);
    const [viewErrorModuleReference, setViewErrorModuleReference] = useState<string | undefined>(undefined);
    const [transactionErrorDeploy, setTransactionErrorDeploy] = useState<string | undefined>(undefined);
    const [transactionErrorInit, setTransactionErrorInit] = useState<string | undefined>(undefined);

    const [uploadError, setUploadError] = useState<string | undefined>(undefined);
    const [uploadError2, setUploadError2] = useState<string | undefined>(undefined);
    const [parsingErrorInit, setParsingErrorInit] = useState<string | undefined>(undefined);
    const [smartContractIndexError, setSmartContractIndexError] = useState<string | undefined>(undefined);
    const [moduleReferenceError, setModuleReferenceError] = useState<string | undefined>(undefined);
    const [moduleReferenceLengthError, setModuleReferenceLengthError] = useState<string | undefined>(undefined);
    const [schemaError, setSchemaError] = useState<FunctionState>({
        initFunction: undefined,
        readFunction: undefined,
        writeFunction: undefined,
    });

    const [accountExistsOnNetwork, setAccountExistsOnNetwork] = useState(true);
    const [moduleReferenceCalculated, setModuleReferenceCalculated] = useState<string | undefined>(undefined);
    const [isModuleReferenceAlreadyDeployedStep1, setIsModuleReferenceAlreadyDeployedStep1] = useState(false);
    const [isModuleReferenceAlreadyDeployedStep2, setIsModuleReferenceAlreadyDeployedStep2] = useState(false);
    const [moduleReferenceDeployed, setModuleReferenceDeployed] = useState<string | undefined>(undefined);

    const [shouldWarnDifferenceModuleReferences, setShouldWarnDifferenceModuleReferences] = useState(false);
    const [shouldWarnInputParameterInSchemaIgnored, setShouldWarnInputParameterInSchemaIgnored] = useState({
        initFunction: false,
        readFunction: false,
        writeFunction: false,
    });

    const [txHashDeploy, setTxHashDeploy] = useState<string | undefined>(undefined);
    const [txHashInit, setTxHashInit] = useState<string | undefined>(undefined);

    const [accountBalance, setAccountBalance] = useState<string | undefined>(undefined);
    const [inputParameterInit, setInputParameterInit] = useState<string | undefined>(undefined);
    const [contractNameInit, setContractNameInit] = useState<string | undefined>('myContract');
    const [moduleReference, setModuleReference] = useState<string | undefined>(
        '91225f9538ac2903466cc4ab07b6eb607a2cd349549f357dfdf4e6042dde0693'
    );
    const [cCDAmountInit, setCCDAmountInit] = useState<bigint>(0n);
    const [base64Module, setBase64Module] = useState<string | undefined>(undefined);
    const [uploadedModuleSchemaBase64Initialization, setUploadedModuleSchemaBase64Initialization] = useState<
        string | undefined
    >(undefined);

    const [dropDownInit, setDropDownInit] = useState('number');
    const [smartContractIndex, setSmartContractIndex] = useState<string | undefined>(undefined);

    const [inputParameterTemplate, setInputParameterTemplate] = useState<string | undefined>(undefined);

    const [maxContractExecutionEnergyInit, setMaxContractExecutionEnergyInit] = useState<bigint>(30000n);
    const [useModuleFromStep1, setUseModuleFromStep1] = useState(false);
    const [contracts, setContracts] = useState<string[]>([]);
    const [displayContracts, setDisplayContracts] = useState<string[]>([]);

    const [embeddedModuleSchemaBase64Init, setEmbeddedModuleSchemaBase64Init] = useState<string | undefined>(undefined);

    const [hasInputParameterInitFunction, setHasInputParameterInitFunction] = useState(false);
    const [isPayableInitFunction, setIsPayableInitFunction] = useState(false);

    const moduleFileRef = useRef(null);
    const contractNameDropDownRef = useRef(null);
    const schemaFileRefInit = useRef(null);
    const inputParameterTextAreaRef = useRef(null);
    const useModuleReferenceFromStep1Ref = useRef(null);
    const moduleReferenceRef = useRef(null);
    const inputParameterFieldRef = useRef(null);
    const inputParameterDropDownInitRef = useRef(null);

    const changeModuleReferenceHandler = useCallback((event: ChangeEvent) => {
        setModuleReferenceLengthError(undefined);
        setModuleReference(undefined);

        const target = event.target as HTMLTextAreaElement;

        const moduleReferenceInput = target.value;

        if (moduleReferenceInput.length !== 64) {
            setModuleReferenceLengthError('Module reference has to be of length 64');
        } else {
            setModuleReference(target.value);
        }
    }, []);

    const changeInputParameterDropDownHandler = useCallback(
        (
            inputParameterDropDownRef: React.MutableRefObject<null>,
            setInputParameter: (arg0: string | undefined) => void,
            setDropDown: (arg0: string) => void,
            setParsingError: (arg0: string | undefined) => void
        ) => {
            setParsingError(undefined);
            setInputParameter(undefined);
            const e = inputParameterDropDownRef.current as unknown as HTMLSelectElement;
            const sel = e.selectedIndex;
            const { value } = e.options[sel];
            setDropDown(value);
        },
        []
    );

    const changeSmarContractDropDownHandler = useCallback((setContractName: (arg0: string) => void) => {
        const e = contractNameDropDownRef.current as unknown as HTMLSelectElement;
        const sel = e.selectedIndex;
        const { value } = e.options[sel];
        setContractName(value);
    }, []);

    const changeBigIntValue = useCallback((event: ChangeEvent, setValue: (arg0: bigint) => void) => {
        const target = event.target as HTMLTextAreaElement;
        setValue(BigInt(target.value));
    }, []);

    const changeStringValue = useCallback((event: ChangeEvent, setValue: (arg0: string) => void) => {
        const target = event.target as HTMLTextAreaElement;
        setValue(target.value);
    }, []);

    const changeInputParameterFieldHandler = useCallback(
        (
            event: ChangeEvent,
            setInputParameter: (arg0: string) => void,
            setParsingError: (arg0: string | undefined) => void
        ) => {
            setParsingError(undefined);
            const target = event.target as HTMLTextAreaElement;
            setInputParameter(target.value);
        },
        []
    );

    const changeInputParameterTextAreaHandler = useCallback(
        (
            event: ChangeEvent,
            setInputParameter: (arg0: string) => void,
            setParsingError: (arg0: string | undefined) => void
        ) => {
            setParsingError(undefined);
            const target = event.target as HTMLTextAreaElement;

            try {
                JSON.parse(target.value);
            } catch (e) {
                setParsingError((e as Error).message);
                return;
            }

            setInputParameter(target.value);
        },
        []
    );

    // Refresh accountInfo periodically.
    // eslint-disable-next-line consistent-return
    useEffect(() => {
        if (connection && client && account) {
            setInterval(() => {
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
                        setViewErrorAccountInfo(undefined);
                    })
                    .catch((e) => {
                        setAccountBalance(undefined);
                        setViewErrorAccountInfo((e as Error).message.replaceAll('%20', ' '));
                        setAccountExistsOnNetwork(false);
                    });
            }, REFRESH_INTERVAL.asMilliseconds());
        }
    }, [connection, account, client]);

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

    // Refresh smartContractIndex periodically.
    // eslint-disable-next-line consistent-return
    useEffect(() => {
        if (connection && client && account && txHashInit !== undefined) {
            const interval = setInterval(() => {
                console.log('refreshing_smartContractIndex');
                client
                    .getBlockItemStatus(txHashInit)
                    .then((report) => {
                        if (report !== undefined) {
                            setSmartContractIndex(undefined);
                            if (report.status === 'finalized') {
                                if (
                                    report.outcome.summary.type === TransactionSummaryType.AccountTransaction &&
                                    report.outcome.summary.transactionType === TransactionKindString.InitContract
                                ) {
                                    setSmartContractIndex(
                                        report.outcome.summary.contractInitialized.address.index.toString()
                                    );
                                    clearInterval(interval);
                                } else {
                                    setSmartContractIndexError('Contract initialization failed');
                                    clearInterval(interval);
                                }
                            }
                        }
                    })
                    .catch((e) => {
                        setSmartContractIndex(undefined);
                        setSmartContractIndexError((e as Error).message);
                        clearInterval(interval);
                    });
            }, REFRESH_INTERVAL.asMilliseconds());
        }
    }, [connection, account, client, txHashInit]);

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

    useEffect(() => {
        if (connection && client && account && moduleReference) {
            client
                .getModuleSource(new ModuleReference(moduleReference))
                .then((value) => {
                    if (value === undefined) {
                        setIsModuleReferenceAlreadyDeployedStep2(false);
                    } else {
                        setIsModuleReferenceAlreadyDeployedStep2(true);
                    }
                })
                .catch(() => {
                    setIsModuleReferenceAlreadyDeployedStep2(false);
                });
        }
    }, [connection, account, client, moduleReference]);

    useEffect(() => {
        if (
            moduleReference !== undefined &&
            moduleReferenceCalculated !== undefined &&
            moduleReferenceCalculated !== moduleReference
        ) {
            setShouldWarnDifferenceModuleReferences(true);
        } else {
            setShouldWarnDifferenceModuleReferences(false);
        }
    }, [moduleReference, moduleReferenceCalculated]);

    useEffect(() => {
        if (inputParameterTemplate !== undefined && hasInputParameterInitFunction === false) {
            setShouldWarnInputParameterInSchemaIgnored({
                ...shouldWarnInputParameterInSchemaIgnored,
                initFunction: true,
            });
        } else {
            setShouldWarnInputParameterInSchemaIgnored({
                ...shouldWarnInputParameterInSchemaIgnored,
                initFunction: false,
            });
        }
    }, [inputParameterTemplate, hasInputParameterInitFunction]);

    useEffect(() => {
        setSchemaError({ ...schemaError, initFunction: undefined });
        setInputParameterTemplate(undefined);

        let initTemplate;

        try {
            if (contractNameInit === undefined) {
                throw new Error('Set smart contract name');
            }

            let schema = '';

            const schemaFromModule = useModuleFromStep1
                ? embeddedModuleSchemaBase64Init
                : uploadedModuleSchemaBase64Initialization;

            if (schemaFromModule !== undefined) {
                schema = schemaFromModule;
            }

            const inputParamterTypeSchemaBuffer = getInitContractParameterSchema(
                toBuffer(schema, 'base64'),
                contractNameInit,
                2
            );

            initTemplate = displayTypeSchemaTemplate(inputParamterTypeSchemaBuffer);

            setInputParameterTemplate(initTemplate);
        } catch (e) {
            if (useModuleFromStep1) {
                setSchemaError({
                    ...schemaError,
                    initFunction: `Could not get embedded schema from the uploaded module. Uncheck "Use Module from Step 1" checkbox to manually upload a schema or uncheck "Has Input Paramter" checkbox if this entrypoint has no input parameter.  Original error: ${e}`,
                });
            } else {
                setSchemaError({
                    ...schemaError,
                    initFunction: `Could not get schema from uploaded schema. Uncheck "Has Input Paramter" checkbox if this entrypoint has no input parameter. Original error: ${e}`,
                });
            }
        }

        if (initTemplate) {
            if (dropDownInit === 'array') {
                const element = inputParameterTextAreaRef.current as unknown as HTMLSelectElement;
                if (element?.value !== undefined) {
                    element.value = getArrayExample(initTemplate);
                    element?.setAttribute('style', `height:${element.scrollHeight}px;overflow-y:hidden;`);
                }
            } else if (dropDownInit === 'object') {
                const element = inputParameterTextAreaRef.current as unknown as HTMLSelectElement;
                if (element?.value !== undefined) {
                    element.value = getObjectExample(initTemplate);
                    element?.setAttribute('style', `height:${element.scrollHeight}px;overflow-y:hidden;`);
                }
            }
        }
    }, [
        hasInputParameterInitFunction,
        useModuleFromStep1,
        contractNameInit,
        uploadedModuleSchemaBase64Initialization,
        dropDownInit,
    ]);

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
                    setViewErrorAccountInfo(undefined);
                })
                .catch((e) => {
                    setViewErrorAccountInfo((e as Error).message.replaceAll('%20', ' '));
                    setAccountBalance(undefined);
                    setAccountExistsOnNetwork(false);
                });
        }
    }, [connection, account, client]);

    useEffect(() => {
        select();
    }, []);

    return (
        <main className="container">
            <div className="textCenter">
                <br />
                {activeConnectorError && (
                    <p className="alert alert-danger" role="alert">
                        Connector Error: {activeConnectorError}.
                    </p>
                )}
                {!activeConnectorError && activeConnectorType && !activeConnector && (
                    <p>
                        <i>Loading connector...</i>
                    </p>
                )}
                {connectError && (
                    <p className="alert alert-danger" role="alert">
                        Connect Error: {connectError}.
                    </p>
                )}
                {!isConnected && (
                    <button
                        className="btn btn-primary me-1"
                        type="button"
                        onClick={() => {
                            connect();
                        }}
                    >
                        Connect To Browser Wallet
                    </button>
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
                            {accountBalance && (
                                <>
                                    <div className="label">Your account balance:</div>
                                    <div>{accountBalance.replace(/(\d)(?=(\d\d\d\d\d\d)+(?!\d))/g, '$1.')} CCD</div>
                                </>
                            )}
                            <Box header="Step 1: Deploy Smart Contract Module">
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
                                            setUploadError(undefined);
                                            setModuleReferenceDeployed(undefined);
                                            setTransactionErrorDeploy(undefined);
                                            setTxHashDeploy(undefined);

                                            const hTMLInputElement =
                                                moduleFileRef.current as unknown as HTMLInputElement;

                                            if (
                                                hTMLInputElement.files !== undefined &&
                                                hTMLInputElement.files !== null &&
                                                hTMLInputElement.files.length > 0
                                            ) {
                                                const file = hTMLInputElement.files[0];
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
                                    <br />
                                    <br />
                                </label>
                                {uploadError !== undefined && (
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
                                        {isModuleReferenceAlreadyDeployedStep1 && (
                                            <div className="alert alert-danger" role="alert">
                                                Module reference already deployed.
                                            </div>
                                        )}
                                        <br />
                                        {!isModuleReferenceAlreadyDeployedStep1 && (
                                            <button
                                                className="btn btn-primary"
                                                type="button"
                                                onClick={() => {
                                                    setTxHashDeploy(undefined);
                                                    setTransactionErrorDeploy(undefined);
                                                    const tx = deploy(connection, account, base64Module);
                                                    tx.then((txHash) => {
                                                        setModuleReferenceDeployed(undefined);
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
                                            CCDScan will take a moment to pick up the above transaction, hence the above
                                            link will work in a bit.
                                        </div>
                                        <div>
                                            Deployed module reference will appear below once the transaction is
                                            finalized.
                                        </div>
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
                            </Box>
                            <Box header="Step 2: Initialize Smart Contract">
                                <br />
                                <br />
                                <div>
                                    <label>
                                        <input
                                            type="checkbox"
                                            id="useModuleReferenceFromStep1"
                                            ref={useModuleReferenceFromStep1Ref}
                                            value={useModuleFromStep1.toString()}
                                            onChange={() => {
                                                setModuleReferenceError(undefined);
                                                setModuleReference(undefined);
                                                setContractNameInit(undefined);
                                                setUploadedModuleSchemaBase64Initialization(undefined);

                                                const checkboxElement =
                                                    useModuleReferenceFromStep1Ref.current as unknown as HTMLInputElement;

                                                setUseModuleFromStep1(checkboxElement.checked);

                                                const element =
                                                    moduleReferenceRef.current as unknown as HTMLTextAreaElement;

                                                element.value = '';

                                                if (
                                                    checkboxElement.checked &&
                                                    moduleReferenceDeployed === undefined &&
                                                    moduleReferenceCalculated === undefined
                                                ) {
                                                    setModuleReferenceError('Module reference is not set in step 1');
                                                }

                                                const newModuleReference =
                                                    moduleReferenceDeployed !== undefined
                                                        ? moduleReferenceDeployed
                                                        : moduleReferenceCalculated;

                                                if (checkboxElement.checked && newModuleReference !== undefined) {
                                                    element.value = newModuleReference;

                                                    setModuleReference(newModuleReference);

                                                    setDisplayContracts(contracts);
                                                    setContractNameInit(contracts[0]);
                                                }
                                            }}
                                        />
                                        <span>{' Use Module from Step 1'}</span>
                                    </label>
                                </div>
                                {useModuleFromStep1 && (
                                    <>
                                        <br />
                                        <div className="alert alert-info" role="alert">
                                            <div>
                                                This checkbox autofilled the <code>module reference</code>, the{' '}
                                                <code>smart contract name</code>, and the{' '}
                                                <code>input parameter schema</code> from the module in step1.
                                            </div>
                                            <br />
                                            <div>
                                                <b>Uncheck</b> this box, if you want to manually fill in a{' '}
                                                <code>module reference</code>, the <code>smart contract name</code>, or
                                                an <code>input parameter schema</code>.
                                            </div>
                                            <br />
                                            <div>
                                                <b>Uncheck</b> and <b>check</b> this box again, if you want to load a
                                                new module from step 1.
                                            </div>
                                        </div>
                                        <br />
                                    </>
                                )}
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
                                        disabled={useModuleFromStep1}
                                        type="text"
                                        value={moduleReference}
                                        onChange={changeModuleReferenceHandler}
                                    />
                                </label>
                                <label className="field">
                                    Max Execution Energy:
                                    <br />
                                    <input
                                        className="inputFieldStyle"
                                        id="maxContractExecutionEnergyInit"
                                        type="number"
                                        value={maxContractExecutionEnergyInit.toString()}
                                        onChange={(event) => {
                                            changeBigIntValue(event, setMaxContractExecutionEnergyInit);
                                        }}
                                    />
                                </label>
                                {useModuleFromStep1 &&
                                displayContracts.length > 0 &&
                                (moduleReferenceDeployed !== undefined || moduleReferenceCalculated !== undefined) ? (
                                    <label className="field">
                                        Smart Contract Name:
                                        <br />
                                        <select
                                            className="dropDownStyle"
                                            name="contractNameDropDown"
                                            id="contractNameDropDown"
                                            ref={contractNameDropDownRef}
                                            onChange={() => {
                                                changeSmarContractDropDownHandler(setContractNameInit);
                                            }}
                                        >
                                            {displayContracts?.map((contract) => (
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
                                            id="contractName"
                                            type="text"
                                            value={contractNameInit}
                                            onChange={(event) => {
                                                changeStringValue(event, setContractNameInit);
                                            }}
                                        />
                                    </label>
                                )}
                                {moduleReferenceLengthError && (
                                    <div className="alert alert-danger" role="alert">
                                        Error: {moduleReferenceLengthError}.
                                    </div>
                                )}
                                <br />
                                <br />
                                <div>
                                    <label>
                                        <input
                                            type="checkbox"
                                            value={isPayableInitFunction.toString()}
                                            onChange={() => {
                                                setCCDAmountInit(0n);
                                                setIsPayableInitFunction(!isPayableInitFunction);
                                            }}
                                        />
                                        <span>{' Is Payable'}</span>
                                    </label>
                                </div>
                                {isPayableInitFunction && (
                                    <div className="box">
                                        <label className="field">
                                            CCD amount (micro):
                                            <br />
                                            <input
                                                className="inputFieldStyle"
                                                id="CCDAmount"
                                                type="number"
                                                value={cCDAmountInit.toString()}
                                                onChange={(event) => {
                                                    changeBigIntValue(event, setCCDAmountInit);
                                                }}
                                            />
                                        </label>
                                    </div>
                                )}
                                <br />
                                <br />
                                <label>
                                    <input
                                        type="checkbox"
                                        value={hasInputParameterInitFunction.toString()}
                                        onChange={() => {
                                            setParsingErrorInit(undefined);
                                            setInputParameterInit(undefined);
                                            setUploadedModuleSchemaBase64Initialization(undefined);
                                            setTransactionErrorInit(undefined);
                                            setDropDownInit('number');
                                            setHasInputParameterInitFunction(!hasInputParameterInitFunction);
                                            setInputParameterTemplate(undefined);
                                            setSchemaError({ ...schemaError, initFunction: undefined });
                                        }}
                                    />
                                    <span>{' Has Input Parameter'}</span>
                                </label>
                                {hasInputParameterInitFunction && (
                                    <div className="box">
                                        {!useModuleFromStep1 && (
                                            <>
                                                <label className="field">
                                                    Upload Smart Contract Module Schema File (e.g. schema.bin):
                                                    <br />
                                                    <br />
                                                    <input
                                                        className="btn btn-primary"
                                                        type="file"
                                                        id="schemaFile"
                                                        ref={schemaFileRefInit}
                                                        accept=".bin"
                                                        onChange={async () => {
                                                            setUploadError2(undefined);
                                                            setUploadedModuleSchemaBase64Initialization(undefined);

                                                            const hTMLInputElement =
                                                                schemaFileRefInit.current as unknown as HTMLInputElement;

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

                                                                setUploadedModuleSchemaBase64Initialization(schema);
                                                            } else {
                                                                setUploadError2('Upload schema file is undefined');
                                                            }
                                                        }}
                                                    />
                                                    <br />
                                                    <br />
                                                </label>
                                                <br />
                                                {uploadedModuleSchemaBase64Initialization && (
                                                    <div className="actionResultBox">
                                                        Schema in base64:
                                                        <div>
                                                            {uploadedModuleSchemaBase64Initialization
                                                                .toString()
                                                                .slice(0, 30)}{' '}
                                                            ...
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                        {uploadError2 !== undefined && (
                                            <div className="alert alert-danger" role="alert">
                                                Error: {uploadError2}.
                                            </div>
                                        )}
                                        {schemaError.initFunction !== undefined && (
                                            <div className="alert alert-danger" role="alert">
                                                Error: {schemaError.initFunction}.
                                            </div>
                                        )}
                                        {inputParameterTemplate && (
                                            <>
                                                <br />
                                                <div className="actionResultBox">
                                                    Input Parameter Template:
                                                    <pre>
                                                        {JSON.stringify(
                                                            JSON.parse(inputParameterTemplate),
                                                            undefined,
                                                            2
                                                        )}
                                                    </pre>
                                                </div>
                                            </>
                                        )}
                                        <label className="field">
                                            Select input parameter type:
                                            <br />
                                            <select
                                                className="dropDownStyle"
                                                name="inputParameterDropDownInit"
                                                id="inputParameterDropDownInit"
                                                ref={inputParameterDropDownInitRef}
                                                onChange={() => {
                                                    changeInputParameterDropDownHandler(
                                                        inputParameterDropDownInitRef,
                                                        setInputParameterInit,
                                                        setDropDownInit,
                                                        setParsingErrorInit
                                                    );
                                                }}
                                            >
                                                <option value="number">number</option>
                                                <option value="string">string</option>
                                                <option value="object">JSON object</option>
                                                <option value="array">array</option>
                                            </select>
                                        </label>
                                        <br />
                                        {(dropDownInit === 'object' || dropDownInit === 'array') && (
                                            <>
                                                <label className="field">
                                                    Add your input parameter ({dropDownInit}):
                                                    <br />
                                                    <br />
                                                </label>
                                                {dropDownInit === 'array' && (
                                                    <textarea
                                                        id="inputParameterTextArea"
                                                        ref={inputParameterTextAreaRef}
                                                        onChange={(event) =>
                                                            changeInputParameterTextAreaHandler(
                                                                event,
                                                                setInputParameterInit,
                                                                setParsingErrorInit
                                                            )
                                                        }
                                                    >
                                                        {getArrayExample(inputParameterTemplate)}
                                                    </textarea>
                                                )}
                                                {dropDownInit === 'object' && (
                                                    <textarea
                                                        id="inputParameterTextArea"
                                                        ref={inputParameterTextAreaRef}
                                                        onChange={(event) =>
                                                            changeInputParameterTextAreaHandler(
                                                                event,
                                                                setInputParameterInit,
                                                                setParsingErrorInit
                                                            )
                                                        }
                                                    >
                                                        {getObjectExample(inputParameterTemplate)}
                                                    </textarea>
                                                )}
                                            </>
                                        )}
                                        {(dropDownInit === 'string' || dropDownInit === 'number') && (
                                            <label className="field">
                                                Add your input parameter ({dropDownInit}):
                                                <br />
                                                <input
                                                    className="inputFieldStyle"
                                                    id="inputParameterField"
                                                    ref={inputParameterFieldRef}
                                                    type="text"
                                                    placeholder={dropDownInit === 'string' ? 'myString' : '1000000'}
                                                    onChange={(event) =>
                                                        changeInputParameterFieldHandler(
                                                            event,
                                                            setInputParameterInit,
                                                            setParsingErrorInit
                                                        )
                                                    }
                                                />
                                            </label>
                                        )}
                                        {parsingErrorInit && (
                                            <div className="alert alert-danger" role="alert">
                                                Error: {parsingErrorInit}.
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
                                        setTxHashInit(undefined);
                                        setSmartContractIndexError(undefined);
                                        setSmartContractIndex(undefined);
                                        setTransactionErrorInit(undefined);
                                        const tx = initialize(
                                            connection,
                                            account,
                                            isModuleReferenceAlreadyDeployedStep2,
                                            moduleReference,
                                            inputParameterInit,
                                            contractNameInit,
                                            hasInputParameterInitFunction,
                                            useModuleFromStep1,
                                            useModuleFromStep1
                                                ? embeddedModuleSchemaBase64Init
                                                : uploadedModuleSchemaBase64Initialization,
                                            dropDownInit,
                                            maxContractExecutionEnergyInit,
                                            cCDAmountInit
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
                                {shouldWarnDifferenceModuleReferences && (
                                    <div className="alert alert-warning" role="alert">
                                        Warning: Module references in step 1 and step 2 are different.
                                    </div>
                                )}
                                {shouldWarnInputParameterInSchemaIgnored.initFunction && (
                                    <div className="alert alert-warning" role="alert">
                                        Warning: Input parameter schema found but &quot;Has Input Parameter&quot;
                                        checkbox is unchecked.
                                    </div>
                                )}
                                {!txHashInit && transactionErrorInit && (
                                    <div className="alert alert-danger" role="alert">
                                        Error: {transactionErrorInit}.
                                    </div>
                                )}
                                {txHashInit && (
                                    <>
                                        <div>
                                            Transaction hash:{' '}
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
                                        </div>
                                        <br />
                                        <div>
                                            CCDScan will take a moment to pick up the above transaction, hence the above
                                            link will work in a bit.
                                        </div>
                                        <div>
                                            The smart contract index will appear below once the transaction is
                                            finalized.
                                        </div>
                                    </>
                                )}
                                <br />
                                {smartContractIndexError !== undefined && (
                                    <div className="alert alert-danger" role="alert">
                                        Error: {smartContractIndexError}.
                                    </div>
                                )}
                                {smartContractIndex !== undefined && (
                                    <div className="actionResultBox">
                                        Smart Contract Inedex:
                                        <div>{smartContractIndex}</div>
                                    </div>
                                )}
                            </Box>

                            {/* Additional helpers: */}

                            <ReadComponent connection={connection} account={account} client={client} />
                            <WriteComponent
                                isTestnet={isTestnet}
                                connection={connection}
                                account={account}
                                client={client}
                            />
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
