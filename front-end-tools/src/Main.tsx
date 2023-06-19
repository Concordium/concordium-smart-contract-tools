/* eslint-disable no-console */
import React, { useEffect, useState, ChangeEvent, PropsWithChildren } from 'react';
import Switch from 'react-switch';
import { WalletConnectionProps, useConnection, useConnect, useGrpcClient } from '@concordium/react-components';
import { AccountAddress } from '@concordium/web-sdk';
import { version } from '../package.json';
import { WalletConnectionTypeButton } from './WalletConnectorTypeButton';

import { initialize, deploy } from './writing_to_blockchain';

import { BROWSER_WALLET, REFRESH_INTERVAL, TESTNET } from './constants';

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
    const client = useGrpcClient(TESTNET);

    const [viewError, setViewError] = useState('');
    const [transactionErrorDeploy, setTransactionErrorDeploy] = useState('');
    const [transactionErrorInit, setTransactionErrorInit] = useState('');
    const [uploadError, setUploadError] = useState('');
    const [uploadError2, setUploadError2] = useState('');
    const [parsingError, setParsingError] = useState('');

    const [txHashDeploy, setTxHashDeploy] = useState('');
    const [txHashInit, setTxHashInit] = useState('');

    const [accountBalance, setAccountBalance] = useState('');
    const [inputParameter, setInputParameter] = useState('');
    const [initName, setInitName] = useState('');
    const [moduleReference, setModuleReference] = useState('');
    const [cCDAmount, setCCDAmount] = useState('');
    const [base64Module, setBase64Module] = useState('');
    const [base64Schema, setBase64Schema] = useState('');
    const [writeDropDown, setWriteDropDown] = useState('number');

    const [isWaitingForTransaction, setWaitingForUser] = useState(false);
    const [hasInputParameter, setHasInputParameter] = useState(false);
    const [isPayable, setIsPayable] = useState(false);

    const changeModuleReferenceHandler = (event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setModuleReference(target.value);
    };

    const changeWriteDropDownHandler = () => {
        setParsingError('');
        setInputParameter('');
        const e = document.getElementById('write') as HTMLSelectElement;
        const sel = e.selectedIndex;
        const { value } = e.options[sel];
        setWriteDropDown(value);
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

    const changeInputParameterTextAreaHandler = (event: ChangeEvent) => {
        const inputTextArea = document.getElementById('inputParameterTextArea');
        inputTextArea?.setAttribute('style', `height:${inputTextArea.scrollHeight}px;overflow-y:hidden;`);

        const target = event.target as HTMLTextAreaElement;

        setParsingError('');
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
        if (connection && account) {
            const interval = setInterval(() => {
                console.log('refreshing');
                client
                    ?.getAccountInfo(new AccountAddress(account))
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
            client
                ?.getAccountInfo(new AccountAddress(account))
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
                            <br />
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
                                            if (hasInputParameter) {
                                                setInputParameter('');
                                                setBase64Schema('');
                                            }
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
                                            Upload Smart Contract Module Schema File:
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
                                                <option value="object">JSON object</option>
                                                <option value="array">array</option>
                                            </select>
                                        </label>
                                        <br />
                                        {(writeDropDown === 'object' || writeDropDown === 'array') && (
                                            <label className="field">
                                                Add your input parameter ({writeDropDown}):
                                                <br />
                                                {writeDropDown === 'array' && (
                                                    <textarea
                                                        id="inputParameterTextArea"
                                                        onChange={changeInputParameterTextAreaHandler}
                                                    >
                                                        Examples:&#10;&#10; [1,2,3] or&#10;&#10;
                                                        [&#34;abc&#34;,&#34;def&#34;] or&#10;&#10; [&#123;
                                                        &#34;myFieldKey&#34;:&#34;myFieldValue&#34;&#125;]
                                                    </textarea>
                                                )}
                                                {writeDropDown === 'object' && (
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
                                        {parsingError && (
                                            <div className="alert alert-danger" role="alert">
                                                Error: {parsingError}.
                                            </div>
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
                                        const tx = initialize(
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
