/* eslint-disable no-console */
import React, { useEffect, useState, ChangeEvent, PropsWithChildren } from 'react';
import { ModuleReference } from '@concordium/web-sdk';
import Switch from 'react-switch';
import { withJsonRpcClient, WalletConnectionProps, useConnection, useConnect } from '@concordium/react-components';
import { version } from '../package.json';
import { WalletConnectionTypeButton } from './WalletConnectorTypeButton';

import { accountInfo } from './reading_from_blockchain';
import { initializeSmartContract, deploy } from './writing_to_blockchain';

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

export default function Main(props: WalletConnectionProps) {
    const { activeConnectorType, activeConnector, activeConnectorError, connectedAccounts, genesisHashes } = props;

    const { connection, setConnection, account } = useConnection(connectedAccounts, genesisHashes);
    const { connect, isConnecting, connectError } = useConnect(activeConnector, setConnection);

    const [viewError, setViewError] = useState('');
    const [transactionErrorDeploy, setTransactionErrorDeploy] = useState('');
    const [transactionErrorInit, setTransactionErrorInit] = useState('');
    const [uploadError, setUploadError] = useState('');
    const [uploadError2, setUploadError2] = useState('');

    const [isWaitingForTransaction, setWaitingForUser] = useState(false);

    const [accountBalance, setAccountBalance] = useState('');

    const [inputParameter, setInputParameter] = useState('');

    const [txHashDeploy, setTxHashDeploy] = useState('');
    const [txHashInit, setTxHashInit] = useState('');

    const [initName, setInitName] = useState('');

    const [moduleReference, setModuleReference] = useState('');
    const [writeDropDown, setWriteDropDown] = useState('number');
    const [hasInputParameter, setHasInputParameter] = useState(false);

    const [isPayable, setIsPayable] = useState(false);

    const [exampleInputParameter, setExampleInputParameter] = useState('');

    const [cCDAmount, setCCDAmount] = useState('');

    const [base64Module, setBase64Module] = useState('');
    const [base64Schema, setBase64Schema] = useState('');

    const changeModuleReferenceHandler = (event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setModuleReference(target.value);
    };

    const changeWriteDropDownHandler = () => {
        const e = document.getElementById('write') as HTMLSelectElement;
        const sel = e.selectedIndex;
        const { value } = e.options[sel];
        setWriteDropDown(value);
        if (writeDropDown === 'array') {
            setExampleInputParameter('[a,b,c]');
        }
        if (writeDropDown === 'object') {
            setExampleInputParameter('{"myFiled":"value"}');
        }
    };

    const changeCCDAmountHandler = (event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setCCDAmount(target.value);
    };

    const changeInitNameHandler = (event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setInitName(target.value);
    };

    const changeInputParameterFieldHandler = (event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setInputParameter(target.value);
    };

    //   export function useContractSchemaRpc(connection: WalletConnection, contract: Info) {
    // const [result, setResult] = useState<Result<SchemaRpcResult | undefined, string>>();
    useEffect(() => {
        if (connection && account) {
            withJsonRpcClient(connection, (rpcClient) =>
                rpcClient.getModuleSource(
                    new ModuleReference('91225f9538ac2903466cc4ab07b6eb607a2cd349549f357dfdf4e6042dde0693')
                )
            )
                .then((value) => {
                    if (value !== undefined) {
                        console.log(`hhhhhhhhhhhh${value}`);
                        // setAccountBalance(value.accountAmount.toString());
                        // setBrowserPublicKey(
                        //     value.accountCredentials[0].value.contents.credentialPublicKeys.keys[0].verifyKey
                        // );
                    }
                    // setViewError('');
                })
                .catch((e) => {
                    // setAccountBalance('');
                    // setBrowserPublicKey('');
                    // setViewError((e as Error).message);
                });
        }
    }, [connection, account]);

    //     ResultAsync.fromPromise(
    //         withJsonRpcClient(connection, (rpc) => rpc.getModuleSource(new ModuleReference(contract.moduleRef))),
    //         errorString
    //     )
    //         .andThen((r) => {
    //             if (!r) {
    //                 return err('module source is empty');
    //             }
    //             // Skip 8-byte header (module version and length).
    //             if (r.length < 8) {
    //                 return err(`module source is ${r.length} bytes which is not enough to fit an 8-byte header`);
    //             }
    //             return ResultAsync.fromPromise(WebAssembly.compile(r.slice(8)), errorString);
    //         })
    //         .andThen(findSchema)
    //         .then(setResult);
    // }, [contract, connection]);

    //     return result;
    // }

    // Refresh accountInfo periodically.
    // eslint-disable-next-line consistent-return
    useEffect(() => {
        if (connection && account) {
            const interval = setInterval(() => {
                console.log('refreshing');
                withJsonRpcClient(connection, (rpcClient) => accountInfo(rpcClient, account))
                    .then((value) => {
                        if (value !== undefined) {
                            setAccountBalance(value.accountAmount.toString());
                        }
                        setViewError('');
                    })
                    .catch((e) => {
                        setAccountBalance('');
                        setViewError((e as Error).message);
                    });
            }, REFRESH_INTERVAL.asMilliseconds());
            return () => clearInterval(interval);
        }
    }, [connection, account]);

    useEffect(() => {
        if (connection && account) {
            withJsonRpcClient(connection, (rpcClient) => accountInfo(rpcClient, account))
                .then((value) => {
                    if (value !== undefined) {
                        setAccountBalance(value.accountAmount.toString());
                    }
                    setViewError('');
                })
                .catch((e) => {
                    setViewError((e as Error).message);
                    setAccountBalance('');
                });
        }
    }, [connection, account]);

    const changeInputParameterTextAreaHandler = (event: ChangeEvent) => {
        const inputTextArea = document.getElementById('inputParameterTextArea');
        inputTextArea?.setAttribute('style', `height:${inputTextArea.scrollHeight}px;overflow-y:hidden;`);

        const target = event.target as HTMLTextAreaElement;
        setInputParameter(JSON.stringify(JSON.parse(target.value)));
    };

    return (
        <main className="container">
            <div className="version">Version: {version}</div>
            <div className="textCenter">
                <br />
                <h1>Deploying and Initializing of Smart Contracts on Concordium</h1>
                <WalletConnectionTypeButton
                    connectorType={BROWSER_WALLET}
                    connectorName="Browser Wallet"
                    setWaitingForUser={setWaitingForUser}
                    connection={connection}
                    {...props}
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
            </div>
            {account && (
                <div className="row">
                    {connection && account !== undefined && (
                        <div className="col-lg-12">
                            {viewError && (
                                <div className="alert alert-danger" role="alert">
                                    Error: {viewError}.
                                </div>
                            )}
                            <div className="label">Connected account:</div>
                            <div>
                                <a
                                    className="link"
                                    href={`https://testnet.ccdscan.io/?dcount=1&dentity=account&daddress=${account}`}
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
                                    Upload Smart Contract Module File:
                                    <br />
                                    <br />
                                    <input
                                        className="btn btn-primary"
                                        type="file"
                                        id="moduleFile"
                                        onChange={async () => {
                                            setUploadError('');

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
                                                    String.fromCharCode(...new Uint8Array(arrayBuffer))
                                                ).trim();
                                                setBase64Module(module);
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
                                {base64Module && (
                                    <>
                                        <div className="actionResultBox">
                                            Module in base64:
                                            <div>{base64Module.toString().slice(0, 30)} ...</div>
                                        </div>
                                        <br />
                                        <button
                                            className="btn btn-primary"
                                            type="button"
                                            onClick={() => {
                                                setTxHashDeploy('');
                                                setTransactionErrorDeploy('');
                                                const tx = deploy(connection, account, base64Module);
                                                tx.then(setTxHashDeploy).catch((err: Error) =>
                                                    setTransactionErrorDeploy((err as Error).message)
                                                );
                                            }}
                                        >
                                            Deploy smart contract module
                                        </button>
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
                                            href={`https://testnet.ccdscan.io/?dcount=1&dentity=transaction&dhash=${txHashDeploy}`}
                                        >
                                            {txHashDeploy}
                                        </a>
                                    </>
                                )}
                            </TestBox>
                            <TestBox header="Step 2: Initialize Smart Contract">
                                <label className="field">
                                    Add Module Reference:
                                    <br />
                                    <input
                                        className="inputFieldStyle"
                                        id="moduleReference"
                                        type="text"
                                        placeholder="91225f9538ac2903466cc4ab07b6eb607a2cd349549f357dfdf4e6042dde0693"
                                        onChange={changeModuleReferenceHandler}
                                    />
                                </label>
                                <br />
                                <label className="field">
                                    Add Smart Contract Name:
                                    <br />
                                    <input
                                        className="inputFieldStyle"
                                        id="initName"
                                        type="text"
                                        placeholder="myContract"
                                        onChange={changeInitNameHandler}
                                    />
                                </label>
                                <div className="switch-wrapper">
                                    <div> Is NOT payable</div>
                                    <Switch
                                        onChange={() => {
                                            setIsPayable(!isPayable);
                                        }}
                                        onColor="#308274"
                                        offColor="#308274"
                                        onHandleColor="#174039"
                                        offHandleColor="#174039"
                                        checked={isPayable}
                                        checkedIcon={false}
                                        uncheckedIcon={false}
                                    />
                                    <div>Is payable</div>
                                </div>
                                {isPayable && (
                                    <label className="field">
                                        Add CCD amount (micro):
                                        <br />
                                        <input
                                            className="inputFieldStyle"
                                            id="CCDAmount"
                                            type="text"
                                            placeholder="1000000"
                                            onChange={changeCCDAmountHandler}
                                        />
                                    </label>
                                )}
                                <br />
                                <div className="switch-wrapper">
                                    <div> Has NO input parameter</div>
                                    <Switch
                                        onChange={() => {
                                            setHasInputParameter(!hasInputParameter);
                                        }}
                                        onColor="#308274"
                                        offColor="#308274"
                                        onHandleColor="#174039"
                                        offHandleColor="#174039"
                                        checked={hasInputParameter}
                                        checkedIcon={false}
                                        uncheckedIcon={false}
                                    />
                                    <div>Has input parameter</div>
                                </div>
                                {hasInputParameter && (
                                    <>
                                        <label className="field">
                                            Upload Smart Contract Schema File:
                                            <br />
                                            <br />
                                            <input
                                                className="btn btn-primary"
                                                type="file"
                                                id="schemaFile"
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
                                                            String.fromCharCode(...new Uint8Array(arrayBuffer))
                                                        ).trim();
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
                                            <select name="write" id="write" onChange={changeWriteDropDownHandler}>
                                                <option value="number">number</option>
                                                <option value="string">string</option>
                                                <option value="object">object</option>
                                                <option value="array">array</option>
                                            </select>
                                        </label>
                                        <br />
                                        {(writeDropDown === 'object' || writeDropDown === 'array') && (
                                            <label className="field">
                                                Add your input parameter ({writeDropDown}):
                                                <br />
                                                <textarea
                                                    id="inputParameterTextArea"
                                                    onChange={changeInputParameterTextAreaHandler}
                                                >
                                                    {exampleInputParameter}
                                                </textarea>
                                            </label>
                                        )}
                                        {(writeDropDown === 'string' || writeDropDown === 'number') && (
                                            <label className="field">
                                                Add your input parameter ({writeDropDown}):
                                                <br />
                                                <input
                                                    className="inputFieldStyle"
                                                    id="inputParameterField"
                                                    type="text"
                                                    placeholder={writeDropDown === 'string' ? 'myString' : '1000000'}
                                                    onChange={changeInputParameterFieldHandler}
                                                />
                                            </label>
                                        )}
                                    </>
                                )}
                                <br />
                                <br />
                                <button
                                    className="btn btn-primary"
                                    type="button"
                                    onClick={() => {
                                        setTxHashInit('');
                                        setTransactionErrorInit('');
                                        const tx = initializeSmartContract(
                                            connection,
                                            account,
                                            moduleReference,
                                            inputParameter,
                                            initName,
                                            base64Schema,
                                            writeDropDown,
                                            cCDAmount
                                        );
                                        tx.then(setTxHashInit).catch((err: Error) =>
                                            setTransactionErrorInit((err as Error).message)
                                        );
                                    }}
                                >
                                    Initialize Smart Contract
                                </button>
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
                                            href={`https://testnet.ccdscan.io/?dcount=1&dentity=transaction&dhash=${txHashInit}`}
                                        >
                                            {txHashInit}
                                        </a>
                                    </>
                                )}
                            </TestBox>
                        </div>
                    )}
                </div>
            )}
        </main>
    );
}
