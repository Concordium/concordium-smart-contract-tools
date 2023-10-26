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
    getUpdateContractParameterSchema,
} from '@concordium/web-sdk';

import { initialize, deploy, write } from './writing_to_blockchain';
import { read, getEmbeddedSchema, getContractInfo } from './reading_from_blockchain';
import { getObjectExample, getArrayExample, arraysEqual } from './utils';

import { BROWSER_WALLET, REFRESH_INTERVAL } from './constants';

type BoxProps = PropsWithChildren<{
    header: string;
}>;

function Box({ header, children }: BoxProps) {
    return (
        <fieldset className="Box">
            <legend>{header}</legend>
            <div className="BoxFields">{children}</div>
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
    const [transactionErrorUpdate, setTransactionErrorUpdate] = useState<string | undefined>(undefined);

    const [uploadError, setUploadError] = useState<string | undefined>(undefined);
    const [uploadError2, setUploadError2] = useState<string | undefined>(undefined);
    const [parsingErrorInit, setParsingErrorInit] = useState<string | undefined>(undefined);
    const [parsingErrorRead, setParsingErrorRead] = useState<string | undefined>(undefined);
    const [parsingErrorWrite, setParsingErrorWrite] = useState<string | undefined>(undefined);
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
    const [txHashUpdate, setTxHashUpdate] = useState<string | undefined>(undefined);

    const [accountBalance, setAccountBalance] = useState<string | undefined>(undefined);
    const [inputParameterInit, setInputParameterInit] = useState<string | undefined>(undefined);
    const [inputParameterRead, setInputParameterRead] = useState<string | undefined>(undefined);
    const [inputParameterWrite, setInputParameterWrite] = useState<string | undefined>(undefined);
    const [contractNameInit, setContractNameInit] = useState<string | undefined>('myContract');
    const [contractNameRead, setContractNameRead] = useState<string | undefined>('myContract');
    const [contractNameWrite, setContractNameWrite] = useState<string | undefined>('myContract');
    const [moduleReference, setModuleReference] = useState<string | undefined>(
        '91225f9538ac2903466cc4ab07b6eb607a2cd349549f357dfdf4e6042dde0693'
    );
    const [cCDAmountInit, setCCDAmountInit] = useState<bigint>(0n);
    const [cCDAmountWrite, setCCDAmountWrite] = useState<bigint>(0n);
    const [base64Module, setBase64Module] = useState<string | undefined>(undefined);
    const [uploadedModuleSchemaBase64Initialization, setUploadedModuleSchemaBase64Initialization] = useState<
        string | undefined
    >(undefined);
    const [uploadedModuleSchemaBase64Read, setUploadedModuleSchemaBase64Read] = useState<string | undefined>(undefined);
    const [uploadedModuleSchemaBase64Write, setUploadedModuleSchemaBase64Write] = useState<string | undefined>(
        undefined
    );
    const [dropDownInit, setDropDownInit] = useState('number');
    const [dropDownRead, setDropDownRead] = useState('number');
    const [dropDownWrite, setDropDownWrite] = useState('number');
    const [smartContractIndex, setSmartContractIndex] = useState<string | undefined>(undefined);
    const [smartContractIndexReadInputField, setSmartContractIndexReadInputField] = useState<bigint>(1999n);
    const [smartContractIndexWriteInputField, setSmartContractIndexWriteInputField] = useState<bigint>(1999n);
    const [entryPointReadFunction, setEntryPointReadFunction] = useState<string | undefined>('view');
    const [entryPointWriteFunction, setEntryPointWriteFunction] = useState<string | undefined>('set');
    const [contractInstanceInfo, setContractInstanceInfo] = useState<
        { contractName: string; methods: string[]; sourceModule: ModuleReference } | undefined
    >(undefined);
    const [returnValue, setReturnValue] = useState<string | undefined>(undefined);
    const [readError, setReadError] = useState<string | undefined>(undefined);
    const [writeError, setWriteError] = useState<string | undefined>(undefined);

    const [inputParameterTemplate, setInputParameterTemplate] = useState<string | undefined>(undefined);
    const [entryPointTemplateReadFunction, setEntryPointTemplateReadFunction] = useState<string | undefined>(undefined);
    const [entryPointTemplateWriteFunction, setEntryPointTemplateWriteFunction] = useState<string | undefined>(
        undefined
    );

    const [maxContractExecutionEnergyInit, setMaxContractExecutionEnergyInit] = useState<bigint>(30000n);
    const [maxContractExecutionEnergyWrite, setMaxContractExecutionEnergyWrite] = useState<bigint>(30000n);
    const [useModuleFromStep1, setUseModuleFromStep1] = useState(false);
    const [contracts, setContracts] = useState<string[]>([]);
    const [displayContracts, setDisplayContracts] = useState<string[]>([]);
    const [writeTransactionOutcome, setWriteTransactionOutcome] = useState<string | undefined>(undefined);

    const [embeddedModuleSchemaBase64Init, setEmbeddedModuleSchemaBase64Init] = useState<string | undefined>(undefined);
    const [embeddedModuleSchemaBase64Read, setEmbeddedModuleSchemaBase64Read] = useState<string | undefined>(undefined);
    const [embeddedModuleSchemaBase64Write, setEmbeddedModuleSchemaBase64Write] = useState<string | undefined>(
        undefined
    );

    const [deriveFromSmartContractIndexRead, setDeriveFromSmartContractIndexRead] = useState(false);
    const [deriveFromSmartContractIndexWrite, setDeriveFromSmartContractIndexWrite] = useState(false);
    const [hasInputParameterInitFunction, setHasInputParameterInitFunction] = useState(false);
    const [hasInputParameterReadFunction, setHasInputParameterReadFunction] = useState(false);
    const [hasInputParameterWriteFunction, setHasInputParameterWriteFunction] = useState(false);
    const [isPayableInitFunction, setIsPayableInitFunction] = useState(false);
    const [isPayableWriteFunction, setIsPayableWriteFunction] = useState(false);

    const moduleFileRef = useRef(null);
    const contractNameDropDownRef = useRef(null);
    const schemaFileRefInit = useRef(null);
    const schemaFileRefRead = useRef(null);
    const schemaFileRefWrite = useRef(null);
    const inputParameterTextAreaRef = useRef(null);
    const useModuleReferenceFromStep1Ref = useRef(null);
    const moduleReferenceRef = useRef(null);
    const inputParameterFieldRef = useRef(null);
    const smartContractIndexReadRef = useRef(null);
    const smartContractIndexWriteRef = useRef(null);
    const inputParameterReadTextAreaRef = useRef(null);
    const inputParameterWriteTextAreaRef = useRef(null);
    const deriveFromSmartContractIndexReadRef = useRef(null);
    const deriveFromSmartContractIndexWriteRef = useRef(null);
    const inputParameterDropDownInitRef = useRef(null);
    const inputParameterDropDownReadRef = useRef(null);
    const inputParameterDropDownWriteRef = useRef(null);

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

    // Refresh writeTransactionOutcome periodically.
    // eslint-disable-next-line consistent-return
    useEffect(() => {
        if (connection && client && account && txHashUpdate !== undefined) {
            const interval = setInterval(() => {
                console.log('refreshing_writeTransactionOutcome');
                client
                    .getBlockItemStatus(txHashUpdate)
                    .then((report) => {
                        if (report !== undefined) {
                            // setViewErrorModuleReference(undefined);
                            if (report.status === 'finalized') {
                                if (
                                    report.outcome.summary.type === TransactionSummaryType.AccountTransaction &&
                                    report.outcome.summary.transactionType === TransactionKindString.Update
                                ) {
                                    setWriteTransactionOutcome('Transaction was successful');
                                    clearInterval(interval);
                                } else {
                                    setWriteTransactionOutcome('Transaction failed');
                                    clearInterval(interval);
                                }
                            }
                        }
                    })
                    .catch((e) => {
                        setWriteTransactionOutcome(`Transaction failed; Error: ${(e as Error).message}`);
                        clearInterval(interval);
                        // setViewErrorModuleReference((e as Error).message);
                    });
            }, REFRESH_INTERVAL.asMilliseconds());
        }
    }, [connection, account, client, txHashUpdate]);

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
        if (entryPointTemplateReadFunction !== undefined && hasInputParameterReadFunction === false) {
            setShouldWarnInputParameterInSchemaIgnored({
                ...shouldWarnInputParameterInSchemaIgnored,
                readFunction: true,
            });
        } else {
            setShouldWarnInputParameterInSchemaIgnored({
                ...shouldWarnInputParameterInSchemaIgnored,
                readFunction: false,
            });
        }
    }, [entryPointTemplateReadFunction, hasInputParameterReadFunction]);

    useEffect(() => {
        if (entryPointTemplateWriteFunction !== undefined && hasInputParameterWriteFunction === false) {
            setShouldWarnInputParameterInSchemaIgnored({
                ...shouldWarnInputParameterInSchemaIgnored,
                writeFunction: true,
            });
        } else {
            setShouldWarnInputParameterInSchemaIgnored({
                ...shouldWarnInputParameterInSchemaIgnored,
                writeFunction: false,
            });
        }
    }, [entryPointTemplateWriteFunction, hasInputParameterWriteFunction]);

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
                    initFunction: `Could not get embedded schema from the uploaded module. \nUncheck "Use Module from Step 1" checkbox to manually upload a schema. Original error: ${e}`,
                });
            } else {
                setSchemaError({
                    ...schemaError,
                    initFunction: `Could not get schema from uploaded schema. Original error: ${e}`,
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
        setSchemaError({ ...schemaError, readFunction: undefined });
        setEntryPointTemplateReadFunction(undefined);

        let receiveTemplateReadFunction;

        try {
            if (entryPointReadFunction === undefined) {
                throw new Error('Set entry point name');
            }

            if (contractNameRead === undefined) {
                throw new Error('Set smart contract name');
            }

            let schema = '';

            const schemaFromModule = deriveFromSmartContractIndexRead
                ? embeddedModuleSchemaBase64Read
                : uploadedModuleSchemaBase64Read;

            if (schemaFromModule !== undefined) {
                schema = schemaFromModule;
            }

            const readFunctionTemplate = getUpdateContractParameterSchema(
                toBuffer(schema, 'base64'),
                contractNameRead,
                entryPointReadFunction
            );

            receiveTemplateReadFunction = displayTypeSchemaTemplate(readFunctionTemplate);

            setEntryPointTemplateReadFunction(receiveTemplateReadFunction);
        } catch (e) {
            if (deriveFromSmartContractIndexRead) {
                setSchemaError({
                    ...schemaError,
                    readFunction: `Could not derive the embedded schema from the smart contract index. \nUncheck "Derive From Smart Contract Index" checkbox to manually upload a schema. Original error: ${e}`,
                });
            } else {
                setSchemaError({
                    ...schemaError,
                    readFunction: `Could not get schema from uploaded schema. Original error: ${e}`,
                });
            }
        }

        if (receiveTemplateReadFunction) {
            if (dropDownRead === 'array') {
                const element = inputParameterReadTextAreaRef.current as unknown as HTMLSelectElement;
                if (element?.value !== undefined) {
                    element.value = getArrayExample(receiveTemplateReadFunction);
                    element?.setAttribute('style', `height:${element.scrollHeight}px;overflow-y:hidden;`);
                }
            } else if (dropDownRead === 'object') {
                const element = inputParameterReadTextAreaRef.current as unknown as HTMLSelectElement;
                if (element?.value !== undefined) {
                    element.value = getObjectExample(receiveTemplateReadFunction);
                    element?.setAttribute('style', `height:${element.scrollHeight}px;overflow-y:hidden;`);
                }
            }
        }
    }, [
        entryPointReadFunction,
        hasInputParameterReadFunction,
        deriveFromSmartContractIndexRead,
        contractNameRead,
        uploadedModuleSchemaBase64Read,
        dropDownRead,
    ]);

    useEffect(() => {
        setSchemaError({
            ...schemaError,
            writeFunction: undefined,
        });
        setEntryPointTemplateWriteFunction(undefined);

        let receiveTemplateWriteFunction;

        try {
            if (entryPointWriteFunction === undefined) {
                throw new Error('Set entry point name');
            }

            if (contractNameWrite === undefined) {
                throw new Error('Set smart contract name');
            }

            let schema = '';

            const schemaFromModule = deriveFromSmartContractIndexWrite
                ? embeddedModuleSchemaBase64Write
                : uploadedModuleSchemaBase64Write;

            if (schemaFromModule !== undefined) {
                schema = schemaFromModule;
            }

            const writeFunctionTemplate = getUpdateContractParameterSchema(
                toBuffer(schema, 'base64'),
                contractNameWrite,
                entryPointWriteFunction
            );

            receiveTemplateWriteFunction = displayTypeSchemaTemplate(writeFunctionTemplate);

            setEntryPointTemplateWriteFunction(receiveTemplateWriteFunction);
        } catch (e) {
            if (deriveFromSmartContractIndexWrite) {
                setSchemaError({
                    ...schemaError,
                    writeFunction: `Could not derive the embedded schema from the smart contract index. \nUncheck "Derive From Smart Contract Index" checkbox to manually upload a schema. Original error: ${e}`,
                });
            } else {
                setSchemaError({
                    ...schemaError,
                    writeFunction: `Could not get schema from uploaded schema. Original error: ${e}`,
                });
            }
        }

        if (receiveTemplateWriteFunction) {
            if (dropDownWrite === 'array') {
                const element = inputParameterWriteTextAreaRef.current as unknown as HTMLSelectElement;
                if (element?.value !== undefined) {
                    element.value = getArrayExample(receiveTemplateWriteFunction);
                    element?.setAttribute('style', `height:${element.scrollHeight}px;overflow-y:hidden;`);
                }
            } else if (dropDownWrite === 'object') {
                const element = inputParameterWriteTextAreaRef.current as unknown as HTMLSelectElement;
                if (element?.value !== undefined) {
                    element.value = getObjectExample(receiveTemplateWriteFunction);
                    element?.setAttribute('style', `height:${element.scrollHeight}px;overflow-y:hidden;`);
                }
            }
        }
    }, [
        entryPointWriteFunction,
        hasInputParameterWriteFunction,
        deriveFromSmartContractIndexWrite,
        contractNameWrite,
        uploadedModuleSchemaBase64Write,
        dropDownWrite,
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
                                <div className="checkbox-wrapper">
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
                                <div className="checkbox-wrapper">
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
                                    <div className="Box">
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
                                    <div className="Box">
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
                            <Box header="Reading from contract">
                                <label className="field">
                                    Smart Contract Index:
                                    <br />
                                    <input
                                        className="inputFieldStyle"
                                        id="smartContractIndexRead"
                                        ref={smartContractIndexReadRef}
                                        type="number"
                                        value={smartContractIndexReadInputField.toString()}
                                        onChange={(event) => {
                                            changeBigIntValue(event, setSmartContractIndexReadInputField);
                                        }}
                                    />
                                </label>
                                {deriveFromSmartContractIndexRead &&
                                contractInstanceInfo !== undefined &&
                                contractInstanceInfo.contractName !== undefined ? (
                                    <label className="field">
                                        Smart Contract Name:
                                        <br />
                                        <input
                                            className="inputFieldStyle"
                                            id="contractName"
                                            type="text"
                                            disabled={deriveFromSmartContractIndexRead}
                                            value={
                                                contractInstanceInfo?.contractName
                                                    ? contractInstanceInfo.contractName
                                                    : 'undefined'
                                            }
                                        />
                                    </label>
                                ) : (
                                    <label className="field">
                                        Smart Contract Name:
                                        <br />
                                        <input
                                            className="inputFieldStyle"
                                            id="contractName"
                                            type="text"
                                            value={contractNameRead}
                                            onChange={(event) => {
                                                changeStringValue(event, setContractNameRead);
                                            }}
                                        />
                                    </label>
                                )}
                                {deriveFromSmartContractIndexRead &&
                                contractInstanceInfo !== undefined &&
                                contractInstanceInfo.methods.length > 0 ? (
                                    <label className="field">
                                        Entry Point Name:
                                        <br />
                                        <select
                                            className="dropDownStyle"
                                            name="entryPoint"
                                            id="entryPoint"
                                            onChange={(event) => {
                                                changeStringValue(event, setEntryPointReadFunction);
                                            }}
                                        >
                                            {contractInstanceInfo.methods?.map((method) => (
                                                <option key={method}>{method}</option>
                                            ))}
                                        </select>
                                    </label>
                                ) : (
                                    <label className="field">
                                        Entry Point Name:
                                        <br />
                                        <input
                                            className="inputFieldStyle"
                                            name="entryPoint"
                                            id="entryPoint"
                                            type="text"
                                            value={entryPointReadFunction}
                                            onChange={(event) => {
                                                changeStringValue(event, setEntryPointReadFunction);
                                            }}
                                        />
                                    </label>
                                )}
                                <br />
                                <br />
                                <div className="checkbox-wrapper">
                                    <label>
                                        <input
                                            type="checkbox"
                                            id="deriveFromSmartContractIndexRef"
                                            ref={deriveFromSmartContractIndexReadRef}
                                            value={deriveFromSmartContractIndexRead.toString()}
                                            onChange={async () => {
                                                setUploadedModuleSchemaBase64Read(undefined);
                                                setSchemaError({
                                                    ...schemaError,
                                                    readFunction: undefined,
                                                });
                                                setEntryPointReadFunction(undefined);
                                                setContractInstanceInfo(undefined);
                                                setReadError(undefined);
                                                setEmbeddedModuleSchemaBase64Read(undefined);

                                                const checkboxElement =
                                                    deriveFromSmartContractIndexReadRef.current as unknown as HTMLInputElement;

                                                setDeriveFromSmartContractIndexRead(checkboxElement.checked);

                                                if (checkboxElement.checked) {
                                                    const promiseContractInfo = getContractInfo(
                                                        client,
                                                        smartContractIndexReadInputField
                                                    );

                                                    promiseContractInfo
                                                        .then((contractInfo) => {
                                                            setContractInstanceInfo(contractInfo);
                                                            setContractNameRead(contractInfo.contractName);
                                                            setEntryPointReadFunction(contractInfo.methods[0]);

                                                            const promise = getEmbeddedSchema(
                                                                client,
                                                                contractInfo.sourceModule
                                                            );

                                                            promise
                                                                .then((embeddedSchema) => {
                                                                    const schema = new Uint8Array(embeddedSchema);

                                                                    const moduleSchemaBase64Embedded = btoa(
                                                                        new Uint8Array(schema).reduce((data, byte) => {
                                                                            return data + String.fromCharCode(byte);
                                                                        }, '')
                                                                    );

                                                                    setEmbeddedModuleSchemaBase64Read(
                                                                        moduleSchemaBase64Embedded
                                                                    );
                                                                })
                                                                .catch((err: Error) => {
                                                                    setReadError((err as Error).message);
                                                                });
                                                        })
                                                        .catch((err: Error) => setReadError((err as Error).message));
                                                }
                                            }}
                                        />
                                        <span>{' Derive From Smart Contract Index'}</span>
                                    </label>
                                </div>
                                {deriveFromSmartContractIndexRead && (
                                    <>
                                        <br />
                                        <div className="alert alert-info" role="alert">
                                            <div>
                                                This checkbox autofilled the <code>smart contract name</code>, the{' '}
                                                <code>entry point name</code>, and the{' '}
                                                <code>receive return_value/parameter schema</code> from the smart
                                                contract index.
                                            </div>
                                            <br />
                                            <div>
                                                <b>Uncheck</b> this box, if you want to manually fill in a{' '}
                                                <code>smart contract name</code>, an <code>entry point name</code>, or a{' '}
                                                <code>receive return_value/parameter schema</code>.
                                            </div>
                                            <br />
                                            <div>
                                                <b>Uncheck</b> and <b>check</b> this box again, if you want to load a
                                                new smart contract index.
                                            </div>
                                        </div>
                                    </>
                                )}
                                {!deriveFromSmartContractIndexRead && (
                                    <>
                                        <br />
                                        <br />
                                        <label className="field">
                                            Upload Smart Contract Module Schema File (e.g. schema.bin):
                                            <br />
                                            <br />
                                            <input
                                                className="btn btn-primary"
                                                type="file"
                                                id="schemaFile"
                                                ref={schemaFileRefRead}
                                                accept=".bin"
                                                onChange={async () => {
                                                    setUploadError2(undefined);
                                                    setUploadedModuleSchemaBase64Read(undefined);

                                                    const hTMLInputElement =
                                                        schemaFileRefRead.current as unknown as HTMLInputElement;

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
                                                        setUploadedModuleSchemaBase64Read(schema);
                                                    } else {
                                                        setUploadError2('Upload schema file is undefined');
                                                    }
                                                }}
                                            />
                                        </label>
                                    </>
                                )}
                                <br />
                                <br />
                                <label>
                                    <input
                                        type="checkbox"
                                        value={hasInputParameterReadFunction.toString()}
                                        onChange={() => {
                                            setParsingErrorRead(undefined);
                                            setInputParameterRead(undefined);
                                            setDropDownRead('number');
                                            setHasInputParameterReadFunction(!hasInputParameterReadFunction);
                                            setEntryPointTemplateReadFunction(undefined);
                                            setSchemaError({
                                                ...schemaError,
                                                readFunction: undefined,
                                            });
                                        }}
                                    />
                                    <span>{' Has Input Parameter'}</span>
                                </label>
                                {hasInputParameterReadFunction && (
                                    <div className="Box">
                                        {!deriveFromSmartContractIndexRead && uploadedModuleSchemaBase64Read && (
                                            <div className="actionResultBox">
                                                Schema in base64:
                                                <div>{uploadedModuleSchemaBase64Read.toString().slice(0, 30)} ...</div>
                                            </div>
                                        )}
                                        {uploadError2 !== undefined && (
                                            <div className="alert alert-danger" role="alert">
                                                Error: {uploadError2}.
                                            </div>
                                        )}
                                        {schemaError.readFunction !== undefined && (
                                            <div className="alert alert-danger" role="alert">
                                                Error: {schemaError.readFunction}.
                                            </div>
                                        )}
                                        {entryPointTemplateReadFunction && (
                                            <>
                                                <br />
                                                <br />
                                                <div className="actionResultBox">
                                                    Parameter Template:
                                                    <pre>
                                                        {JSON.stringify(
                                                            JSON.parse(entryPointTemplateReadFunction),
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
                                                name="inputParameterDropDownRead"
                                                id="inputParameterDropDownRead"
                                                ref={inputParameterDropDownReadRef}
                                                onChange={() =>
                                                    changeInputParameterDropDownHandler(
                                                        inputParameterDropDownReadRef,
                                                        setInputParameterRead,
                                                        setDropDownRead,
                                                        setParsingErrorRead
                                                    )
                                                }
                                            >
                                                <option value="number">number</option>
                                                <option value="string">string</option>
                                                <option value="object">JSON object</option>
                                                <option value="array">array</option>
                                            </select>
                                        </label>
                                        <br />
                                        {(dropDownRead === 'object' || dropDownRead === 'array') && (
                                            <>
                                                <label className="field">
                                                    Add your input parameter ({dropDownRead}):
                                                    <br />
                                                    <br />
                                                </label>
                                                {dropDownRead === 'array' && (
                                                    <textarea
                                                        id="inputParameterReadTextAreaRef1"
                                                        ref={inputParameterReadTextAreaRef}
                                                        onChange={(event) =>
                                                            changeInputParameterTextAreaHandler(
                                                                event,
                                                                setInputParameterRead,
                                                                setParsingErrorRead
                                                            )
                                                        }
                                                    >
                                                        {getArrayExample(entryPointTemplateReadFunction)}
                                                    </textarea>
                                                )}
                                                {dropDownRead === 'object' && (
                                                    <textarea
                                                        id="inputParameterReadTextAreaRef2"
                                                        ref={inputParameterReadTextAreaRef}
                                                        onChange={(event) =>
                                                            changeInputParameterTextAreaHandler(
                                                                event,
                                                                setInputParameterRead,
                                                                setParsingErrorRead
                                                            )
                                                        }
                                                    >
                                                        {getObjectExample(entryPointTemplateReadFunction)}
                                                    </textarea>
                                                )}
                                            </>
                                        )}
                                        {(dropDownRead === 'string' || dropDownRead === 'number') && (
                                            <label className="field">
                                                Add your input parameter ({dropDownRead}):
                                                <br />
                                                <input
                                                    className="inputFieldStyle"
                                                    id="inputParameterField"
                                                    ref={inputParameterFieldRef}
                                                    type="text"
                                                    placeholder={dropDownRead === 'string' ? 'myString' : '1000000'}
                                                    onChange={(event) =>
                                                        changeInputParameterFieldHandler(
                                                            event,
                                                            setInputParameterRead,
                                                            setParsingErrorRead
                                                        )
                                                    }
                                                />
                                            </label>
                                        )}
                                        {parsingErrorRead && (
                                            <div className="alert alert-danger" role="alert">
                                                Error: {parsingErrorRead}.
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
                                        setReadError(undefined);
                                        setReturnValue(undefined);
                                        const promise = read(
                                            client,
                                            contractNameRead,
                                            smartContractIndexReadInputField,
                                            entryPointReadFunction,
                                            deriveFromSmartContractIndexRead
                                                ? embeddedModuleSchemaBase64Read
                                                : uploadedModuleSchemaBase64Read,
                                            inputParameterRead,
                                            dropDownRead,
                                            hasInputParameterReadFunction,
                                            deriveFromSmartContractIndexRead
                                        );

                                        promise
                                            .then((value) => {
                                                setReturnValue(value);
                                            })
                                            .catch((err: Error) => setReadError((err as Error).message));
                                    }}
                                >
                                    Read Smart Contract
                                </button>
                                <br />
                                <br />
                                {(deriveFromSmartContractIndexRead
                                    ? embeddedModuleSchemaBase64Read
                                    : uploadedModuleSchemaBase64Read) === undefined && (
                                    <div className="alert alert-warning" role="alert">
                                        Warning: ModuleSchema is undefined. Return value might not be correctly decoded.
                                    </div>
                                )}
                                {shouldWarnInputParameterInSchemaIgnored.readFunction && (
                                    <div className="alert alert-warning" role="alert">
                                        Warning: Input parameter schema found but &quot;Has Input Parameter&quot;
                                        checkbox is unchecked.
                                    </div>
                                )}
                                {returnValue && (
                                    <div className="actionResultBox">
                                        Read value:
                                        <pre>{JSON.stringify(JSON.parse(returnValue), undefined, 2)}</pre>
                                    </div>
                                )}
                                {readError && (
                                    <div className="alert alert-danger" role="alert">
                                        Error: {readError}.
                                    </div>
                                )}
                            </Box>
                            <Box header="Writing to contract">
                                <label className="field">
                                    Smart Contract Index:
                                    <br />
                                    <input
                                        className="inputFieldStyle"
                                        id="smartContractIndexWrite"
                                        ref={smartContractIndexWriteRef}
                                        type="number"
                                        value={smartContractIndexWriteInputField.toString()}
                                        onChange={(event) => {
                                            changeBigIntValue(event, setSmartContractIndexWriteInputField);
                                        }}
                                    />
                                </label>
                                {deriveFromSmartContractIndexWrite &&
                                contractInstanceInfo !== undefined &&
                                contractInstanceInfo.contractName !== undefined ? (
                                    <label className="field">
                                        Smart Contract Name:
                                        <br />
                                        <input
                                            className="inputFieldStyle"
                                            id="contractName"
                                            type="text"
                                            disabled={deriveFromSmartContractIndexWrite}
                                            value={
                                                contractInstanceInfo?.contractName
                                                    ? contractInstanceInfo.contractName
                                                    : 'undefined'
                                            }
                                        />
                                    </label>
                                ) : (
                                    <label className="field">
                                        Smart Contract Name:
                                        <br />
                                        <input
                                            className="inputFieldStyle"
                                            id="contractName"
                                            type="text"
                                            value={contractNameWrite}
                                            onChange={(event) => {
                                                changeStringValue(event, setContractNameWrite);
                                            }}
                                        />
                                    </label>
                                )}
                                {deriveFromSmartContractIndexWrite &&
                                contractInstanceInfo !== undefined &&
                                contractInstanceInfo.methods.length > 0 ? (
                                    <label className="field">
                                        Entry Point Name:
                                        <br />
                                        <select
                                            className="dropDownStyle"
                                            name="entryPoint"
                                            id="entryPoint"
                                            onChange={(event) => {
                                                changeStringValue(event, setEntryPointWriteFunction);
                                            }}
                                        >
                                            {contractInstanceInfo.methods?.map((method) => (
                                                <option key={method}>{method}</option>
                                            ))}
                                        </select>
                                    </label>
                                ) : (
                                    <label className="field">
                                        Entry Point Name:
                                        <br />
                                        <input
                                            className="inputFieldStyle"
                                            name="entryPoint"
                                            id="entryPoint"
                                            type="text"
                                            value={entryPointWriteFunction}
                                            onChange={(event) => {
                                                changeStringValue(event, setEntryPointWriteFunction);
                                            }}
                                        />
                                    </label>
                                )}
                                <label className="field">
                                    Max Execution Energy:
                                    <br />
                                    <input
                                        className="inputFieldStyle"
                                        id="maxContractExecutionEnergyWrite"
                                        type="number"
                                        value={maxContractExecutionEnergyWrite.toString()}
                                        onChange={(event) => {
                                            changeBigIntValue(event, setMaxContractExecutionEnergyWrite);
                                        }}
                                    />
                                </label>
                                <br />
                                <br />
                                <div className="checkbox-wrapper">
                                    <label>
                                        <input
                                            type="checkbox"
                                            id="deriveFromSmartContractIndexRef"
                                            ref={deriveFromSmartContractIndexWriteRef}
                                            value={deriveFromSmartContractIndexWrite.toString()}
                                            onChange={async () => {
                                                setUploadedModuleSchemaBase64Write(undefined);
                                                setSchemaError({
                                                    ...schemaError,
                                                    writeFunction: undefined,
                                                });
                                                setEntryPointWriteFunction(undefined);
                                                setContractInstanceInfo(undefined);
                                                setWriteError(undefined);
                                                setEmbeddedModuleSchemaBase64Read(undefined);

                                                const checkboxElement =
                                                    deriveFromSmartContractIndexWriteRef.current as unknown as HTMLInputElement;

                                                setDeriveFromSmartContractIndexWrite(checkboxElement.checked);

                                                if (checkboxElement.checked) {
                                                    const promiseContractInfo = getContractInfo(
                                                        client,
                                                        smartContractIndexWriteInputField
                                                    );

                                                    promiseContractInfo
                                                        .then((contractInfo) => {
                                                            setContractInstanceInfo(contractInfo);
                                                            setContractNameWrite(contractInfo.contractName);
                                                            setEntryPointWriteFunction(contractInfo.methods[0]);

                                                            const promise = getEmbeddedSchema(
                                                                client,
                                                                contractInfo.sourceModule
                                                            );

                                                            promise
                                                                .then((embeddedSchema) => {
                                                                    const schema = new Uint8Array(embeddedSchema);

                                                                    const moduleSchemaBase64Embedded = btoa(
                                                                        new Uint8Array(schema).reduce((data, byte) => {
                                                                            return data + String.fromCharCode(byte);
                                                                        }, '')
                                                                    );

                                                                    setEmbeddedModuleSchemaBase64Write(
                                                                        moduleSchemaBase64Embedded
                                                                    );
                                                                })
                                                                .catch((err: Error) => {
                                                                    setWriteError((err as Error).message);
                                                                });
                                                        })
                                                        .catch((err: Error) => setWriteError((err as Error).message));
                                                }
                                            }}
                                        />
                                        <span>{' Derive From Smart Contract Index'}</span>
                                    </label>
                                </div>
                                {deriveFromSmartContractIndexWrite && (
                                    <>
                                        <br />
                                        <div className="alert alert-info" role="alert">
                                            <div>
                                                This checkbox autofilled the <code>smart contract name</code>, the{' '}
                                                <code>entry point name</code>, and the{' '}
                                                <code>receive parameter schema</code> from the smart contract index.
                                            </div>
                                            <br />
                                            <div>
                                                <b>Uncheck</b> this box, if you want to manually fill in a{' '}
                                                <code>smart contract name</code>, an <code>entry point name</code>, or a{' '}
                                                <code>receive parameter schema</code>.
                                            </div>
                                            <br />
                                            <div>
                                                <b>Uncheck</b> and <b>check</b> this box again, if you want to load a
                                                new smart contract index.
                                            </div>
                                        </div>
                                    </>
                                )}
                                <br />
                                <br />
                                <div className="checkbox-wrapper">
                                    <label>
                                        <input
                                            type="checkbox"
                                            value={isPayableWriteFunction.toString()}
                                            onChange={() => {
                                                setCCDAmountWrite(0n);
                                                setIsPayableWriteFunction(!isPayableWriteFunction);
                                            }}
                                        />
                                        <span>{' Is Payable'}</span>
                                    </label>
                                </div>
                                {isPayableWriteFunction && (
                                    <div className="Box">
                                        <label className="field">
                                            CCD amount (micro):
                                            <br />
                                            <input
                                                className="inputFieldStyle"
                                                id="CCDAmount"
                                                type="number"
                                                value={cCDAmountWrite.toString()}
                                                onChange={(event) => {
                                                    changeBigIntValue(event, setCCDAmountWrite);
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
                                        value={hasInputParameterWriteFunction.toString()}
                                        onChange={() => {
                                            setParsingErrorWrite(undefined);
                                            setInputParameterWrite(undefined);
                                            setUploadedModuleSchemaBase64Write(undefined);
                                            setDropDownWrite('number');
                                            setHasInputParameterWriteFunction(!hasInputParameterWriteFunction);
                                            setEntryPointTemplateWriteFunction(undefined);
                                            setSchemaError({
                                                ...schemaError,
                                                writeFunction: undefined,
                                            });
                                        }}
                                    />
                                    <span>{' Has Input Parameter'}</span>
                                </label>
                                <br />
                                {hasInputParameterWriteFunction && (
                                    <div className="Box">
                                        {!deriveFromSmartContractIndexWrite && (
                                            <label className="field">
                                                Upload Smart Contract Module Schema File (e.g. schema.bin):
                                                <br />
                                                <br />
                                                <input
                                                    className="btn btn-primary"
                                                    type="file"
                                                    id="schemaFile"
                                                    ref={schemaFileRefWrite}
                                                    accept=".bin"
                                                    onChange={async () => {
                                                        setUploadError2(undefined);
                                                        setUploadedModuleSchemaBase64Write(undefined);

                                                        const hTMLInputElement =
                                                            schemaFileRefWrite.current as unknown as HTMLInputElement;

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

                                                            setUploadedModuleSchemaBase64Write(schema);
                                                        } else {
                                                            setUploadError2('Upload schema file is undefined');
                                                        }
                                                    }}
                                                />
                                            </label>
                                        )}
                                        {!deriveFromSmartContractIndexWrite && uploadedModuleSchemaBase64Write && (
                                            <>
                                                <br />
                                                <br />

                                                <div className="actionResultBox">
                                                    Schema in base64:
                                                    <div>
                                                        {uploadedModuleSchemaBase64Write.toString().slice(0, 30)} ...
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                        <br />
                                        <br />
                                        {uploadError2 !== undefined && (
                                            <div className="alert alert-danger" role="alert">
                                                Error: {uploadError2}.
                                            </div>
                                        )}
                                        {schemaError.writeFunction !== undefined && (
                                            <div className="alert alert-danger" role="alert">
                                                Error: {schemaError.writeFunction}.
                                            </div>
                                        )}
                                        {writeError && (
                                            <div className="alert alert-danger" role="alert">
                                                Error: {writeError}.
                                            </div>
                                        )}
                                        {entryPointTemplateWriteFunction && (
                                            <div className="actionResultBox">
                                                Parameter Template:
                                                <pre>
                                                    {JSON.stringify(
                                                        JSON.parse(entryPointTemplateWriteFunction),
                                                        undefined,
                                                        2
                                                    )}
                                                </pre>
                                            </div>
                                        )}
                                        <label className="field">
                                            Select input parameter type:
                                            <br />
                                            <select
                                                className="dropDownStyle"
                                                name="inputParameterDropDown"
                                                id="inputParameterDropDown"
                                                ref={inputParameterDropDownWriteRef}
                                                onChange={() =>
                                                    changeInputParameterDropDownHandler(
                                                        inputParameterDropDownWriteRef,
                                                        setInputParameterWrite,
                                                        setDropDownWrite,
                                                        setParsingErrorWrite
                                                    )
                                                }
                                            >
                                                <option value="number">number</option>
                                                <option value="string">string</option>
                                                <option value="object">JSON object</option>
                                                <option value="array">array</option>
                                            </select>
                                        </label>
                                        <br />
                                        {(dropDownWrite === 'object' || dropDownWrite === 'array') && (
                                            <>
                                                <label className="field">
                                                    Add your input parameter ({dropDownWrite}):
                                                    <br />
                                                    <br />
                                                </label>
                                                {dropDownWrite === 'array' && (
                                                    <textarea
                                                        id="inputParameterWriteTextAreaRef1"
                                                        ref={inputParameterWriteTextAreaRef}
                                                        onChange={(event) =>
                                                            changeInputParameterTextAreaHandler(
                                                                event,
                                                                setInputParameterWrite,
                                                                setParsingErrorWrite
                                                            )
                                                        }
                                                    >
                                                        {getArrayExample(entryPointTemplateWriteFunction)}
                                                    </textarea>
                                                )}
                                                {dropDownWrite === 'object' && (
                                                    <textarea
                                                        id="inputParameterWriteTextAreaRef2"
                                                        ref={inputParameterWriteTextAreaRef}
                                                        onChange={(event) =>
                                                            changeInputParameterTextAreaHandler(
                                                                event,
                                                                setInputParameterWrite,
                                                                setParsingErrorWrite
                                                            )
                                                        }
                                                    >
                                                        {getObjectExample(entryPointTemplateWriteFunction)}
                                                    </textarea>
                                                )}
                                            </>
                                        )}
                                        {(dropDownWrite === 'string' || dropDownWrite === 'number') && (
                                            <label className="field">
                                                Add your input parameter ({dropDownWrite}):
                                                <br />
                                                <input
                                                    className="inputFieldStyle"
                                                    id="inputParameterField"
                                                    ref={inputParameterFieldRef}
                                                    type="text"
                                                    placeholder={dropDownWrite === 'string' ? 'myString' : '1000000'}
                                                    onChange={(event) =>
                                                        changeInputParameterFieldHandler(
                                                            event,
                                                            setInputParameterWrite,
                                                            setParsingErrorWrite
                                                        )
                                                    }
                                                />
                                            </label>
                                        )}
                                        {parsingErrorWrite && (
                                            <div className="alert alert-danger" role="alert">
                                                Error: {parsingErrorWrite}.
                                            </div>
                                        )}
                                    </div>
                                )}
                                <br />
                                <button
                                    className="btn btn-primary"
                                    type="button"
                                    onClick={() => {
                                        setTxHashUpdate(undefined);
                                        setTransactionErrorUpdate(undefined);
                                        setWriteTransactionOutcome(undefined);
                                        const tx = write(
                                            connection,
                                            account,
                                            inputParameterWrite,
                                            contractNameWrite,
                                            entryPointWriteFunction,
                                            hasInputParameterWriteFunction,
                                            deriveFromSmartContractIndexWrite,
                                            deriveFromSmartContractIndexWrite
                                                ? embeddedModuleSchemaBase64Write
                                                : uploadedModuleSchemaBase64Write,
                                            dropDownWrite,
                                            maxContractExecutionEnergyWrite,
                                            smartContractIndexWriteInputField,
                                            cCDAmountWrite
                                        );

                                        tx.then(setTxHashUpdate).catch((err: Error) =>
                                            setTransactionErrorUpdate((err as Error).message)
                                        );
                                    }}
                                >
                                    Write Smart Contract
                                </button>
                                <br />
                                <br />
                                {shouldWarnInputParameterInSchemaIgnored.writeFunction && (
                                    <div className="alert alert-warning" role="alert">
                                        Warning: Input parameter schema found but &quot;Has Input Parameter&quot;
                                        checkbox is unchecked.
                                    </div>
                                )}
                                {!txHashUpdate && transactionErrorUpdate && (
                                    <div className="alert alert-danger" role="alert">
                                        Error: {transactionErrorUpdate}.
                                    </div>
                                )}
                                {txHashUpdate && (
                                    <>
                                        <div>
                                            Transaction hash:{' '}
                                            <a
                                                className="link"
                                                target="_blank"
                                                rel="noreferrer"
                                                href={`https://${
                                                    isTestnet ? `testnet.` : ``
                                                }ccdscan.io/?dcount=1&dentity=transaction&dhash=${txHashUpdate}`}
                                            >
                                                {txHashUpdate}
                                            </a>
                                        </div>
                                        <br />
                                        <div>
                                            CCDScan will take a moment to pick up the above transaction, hence the above
                                            link will work in a bit. The outcome of the transaction will be displayed
                                            below.
                                        </div>
                                    </>
                                )}
                                {writeTransactionOutcome === 'Success' && (
                                    <>
                                        <br />
                                        <div className="actionResultBox">
                                            Outcome of transaction:
                                            <div>{writeTransactionOutcome}</div>
                                        </div>
                                    </>
                                )}
                                {writeTransactionOutcome !== undefined && writeTransactionOutcome !== 'Success' && (
                                    <>
                                        <br />
                                        <div className="alert alert-danger" role="alert">
                                            Error: {writeTransactionOutcome}.
                                        </div>
                                    </>
                                )}
                            </Box>
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
