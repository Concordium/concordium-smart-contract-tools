/* eslint-disable no-console */
import React, { useEffect, useState, ChangeEvent, PropsWithChildren } from 'react';
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
    sha256,
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

    const [isWaitingForTransaction, setWaitingForUser] = useState(false);
    const [hasInputParameter, setHasInputParameter] = useState(false);
    const [isPayable, setIsPayable] = useState(false);

    const changeModuleReferenceHandler = (event: ChangeEvent) => {
        setTransactionErrorInit('');
        const target = event.target as HTMLTextAreaElement;
        setModuleReference(target.value);
    };

    const changeDropDownHandler = () => {
        setParsingError('');
        setInputParameter('');
        setTransactionErrorInit('');
        const e = document.getElementById('write') as HTMLSelectElement;
        const sel = e.selectedIndex;
        const { value } = e.options[sel];
        setDropDown(value);
    };

    const changeCCDAmountHandler = (event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setCCDAmount(target.value);
    };

    const changeInitNameHandler = (event: ChangeEvent) => {
        setTransactionErrorInit('');
        const target = event.target as HTMLTextAreaElement;
        setInitName(target.value);
    };

    const changeInputParameterFieldHandler = (event: ChangeEvent) => {
        setParsingError('');
        setTransactionErrorInit('');
        const target = event.target as HTMLTextAreaElement;
        setInputParameter(target.value);
    };

    const changeInputParameterTextAreaHandler = (event: ChangeEvent) => {
        setParsingError('');
        setTransactionErrorInit('');
        const inputTextArea = document.getElementById('inputParameterTextArea');
        inputTextArea?.setAttribute('style', `height:${inputTextArea.scrollHeight}px;overflow-y:hidden;`);
        const target = event.target as HTMLTextAreaElement;

        try {
            JSON.parse(target.value);
        } catch (e) {
            setParsingError((e as Error).message);
            return;
        }

        setInputParameter(JSON.stringify(JSON.parse(target.value)));
    };

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
                        setViewErrorAccountInfo((e as Error).message);
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
                    setViewErrorAccountInfo((e as Error).message);
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
                            <br />
                            <TestBox header="Step 1: Deploy Smart Contract Module">
                                <label className="field">
                                    Upload Smart Contract Module File (e.g. myContract.wasm.v1):
                                    <br />
                                    <br />
                                    <input
                                        className="btn btn-primary"
                                        type="file"
                                        id="moduleFile"
                                        accept=".wasm,.wasm.v0,.wasm.v1"
                                        onChange={async () => {
                                            setUploadError('');
                                            setModuleReferenceDeployed('');
                                            setTransactionErrorDeploy('');
                                            setTxHashDeploy('');

                                            const hTMLInputElement = document.getElementById(
                                                'moduleFile'
                                            ) as HTMLInputElement;

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
                                            onChange={() => {
                                                const checkboxElement = document.getElementById(
                                                    'useModuleReferenceFromStep1'
                                                ) as HTMLInputElement;

                                                if (
                                                    checkboxElement.checked &&
                                                    (moduleReferenceDeployed || moduleReferenceCalculated !== undefined)
                                                ) {
                                                    const element = document.getElementById(
                                                        'moduleReference'
                                                    ) as HTMLTextAreaElement;
                                                    element.value =
                                                        moduleReferenceDeployed || moduleReferenceCalculated;

                                                    setModuleReference(
                                                        moduleReferenceDeployed || moduleReferenceCalculated
                                                    );
                                                }
                                            }}
                                        />
                                        <span>{' Use Module Reference from Step 1'}</span>
                                    </label>
                                </div>
                                <label className="field">
                                    Module Reference:
                                    <br />
                                    <input
                                        className="inputFieldStyle"
                                        id="moduleReference"
                                        type="text"
                                        placeholder="91225f9538ac2903466cc4ab07b6eb607a2cd349549f357dfdf4e6042dde0693"
                                        onChange={changeModuleReferenceHandler}
                                    />
                                </label>
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
                                                accept=".bin"
                                                onChange={async () => {
                                                    setUploadError('');

                                                    const hTMLInputElement = document.getElementById(
                                                        'schemaFile'
                                                    ) as HTMLInputElement;

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
                                            <select name="write" id="write" onChange={changeDropDownHandler}>
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
                                                        onChange={changeInputParameterTextAreaHandler}
                                                    >
                                                        &#123;&#10; &#34;myStringField&#34;:&#34;FieldValue&#34;,&#10;
                                                        &#34;myNumberField&#34;:4,&#10; &#34;myArray&#34;:[1,2,3],&#10;
                                                        &#34;myObject&#34;:&#123;&#10;
                                                        &#9;&#9;&#34;myField1&#34;:&#34;FieldValue&#34;&#10;
                                                        &#9;&#125;&#10; &#125;
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
                        </div>
                    )}
                </div>
            )}
        </main>
    );
}
