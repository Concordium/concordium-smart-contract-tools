/* eslint-disable no-console */
import React, { useEffect, useState, ChangeEvent, PropsWithChildren } from 'react';
import { toBuffer, serializeTypeValue, ModuleReference, CcdAmount } from '@concordium/web-sdk';
import Switch from 'react-switch';
import { withJsonRpcClient, WalletConnectionProps, useConnection, useConnect } from '@concordium/react-components';
import { Button, Col, Row, Form, InputGroup } from 'react-bootstrap';
import { version } from '../package.json';
import { WalletConnectionTypeButton } from './WalletConnectorTypeButton';

import { accountInfo } from './reading_from_blockchain';
import { initializeSmartContract, deploy } from './writing_to_blockchain';

import {
    BROWSER_WALLET,
    REFRESH_INTERVAL,
    STORAGE_CONTRACT_SERIALIZATION_HELPER_PARAMETER_SCHEMA,
    CREDENTIAL_REGISTRY_STORAGE_CONTRACT_INDEX,
} from './constants';

type TestBoxProps = PropsWithChildren<{
    header: string;
    note: string;
}>;

function TestBox({ header, children, note }: TestBoxProps) {
    return (
        <fieldset className="testBox">
            <legend>{header}</legend>
            <div className="testBoxFields">{children}</div>
            <br />
            <p className="note">{note}</p>
        </fieldset>
    );
}

async function addSchema(
    credentialTypes: string[],
    setCredentialTypes: (value: string[]) => void,
    schemas: object[],
    setSchemas: (value: object[]) => void,
    credentialSchemaURLs: string[],
    setCredentialSchemaURLs: (value: string[]) => void,
    newCredentialType: string,
    setCredentialTypeInput: (value: string) => void,
    credentialSchemaURLInput: string,
    setCredentialSchemaURLInput: (value: string) => void
) {
    if (credentialTypes.includes(newCredentialType)) {
        throw new Error(`duplicated CredentialType: ${newCredentialType}`);
    }
    if (newCredentialType) {
        setCredentialTypes([...credentialTypes, newCredentialType]);
        setCredentialSchemaURLs([...credentialSchemaURLs, credentialSchemaURLInput]);
        setCredentialTypeInput('');
        setCredentialSchemaURLInput('');

        setSchemas([
            ...schemas,
            [
                {
                    credential_type: newCredentialType,
                },
                {
                    schema_ref: {
                        hash: {
                            None: [],
                        },
                        url: credentialSchemaURLInput,
                    },
                },
            ],
        ]);
    }
}

async function addRevokationKey(
    revocationKeys: string[],
    setRevocationKeys: (value: string[]) => void,
    setRevoationKeyInput: (value: string) => void,
    newRevocationKey: string
) {
    if (revocationKeys.includes(newRevocationKey)) {
        throw new Error(`Duplicate revocation key: ${newRevocationKey}`);
    }
    if (newRevocationKey.length !== 64) {
        throw new Error(`Revocation key should have a length of 64`);
    }
    if (newRevocationKey) {
        setRevocationKeys([...revocationKeys, newRevocationKey]);
        setRevoationKeyInput('');
    }
}

export default function Main(props: WalletConnectionProps) {
    const { activeConnectorType, activeConnector, activeConnectorError, connectedAccounts, genesisHashes } = props;

    const { connection, setConnection, account } = useConnection(connectedAccounts, genesisHashes);
    const { connect, isConnecting, connectError } = useConnect(activeConnector, setConnection);

    const [viewError, setViewError] = useState('');
    const [signingError, setSigningError] = useState('');
    const [transactionError, setTransactionError] = useState('');
    const [userInputError, setUserInputError] = useState('');
    const [userInputError2, setUserInputError2] = useState('');
    const [uploadError, setUploadError] = useState('');
    const [uploadError2, setUploadError2] = useState('');

    const [credentialRegistryContratIndex, setCredentialRegistryContratIndex] = useState(0);

    const [isWaitingForTransaction, setWaitingForUser] = useState(false);

    const [accountBalance, setAccountBalance] = useState('');

    const [credentialState, setCredentialState] = useState('');
    const [credentialStateError, setCredentialStateError] = useState('');

    const [credentialRegistryState, setCredentialRegistryState] = useState('');
    const [credentialRegistryStateError, setCredentialRegistryStateError] = useState('');

    const [signature, setSignature] = useState('');
    const [inputParameter, setInputParameter] = useState('');

    const [txHash, setTxHash] = useState('');
    const [publicKey, setPublicKey] = useState('');

    const [browserPublicKey, setBrowserPublicKey] = useState('');
    const [initName, setInitName] = useState('');

    const [moduleReference, setModuleReference] = useState('');
    const [credentialMetaDataURL, setCredentialMetaDataURL] = useState('myType');
    const [credentialType, setCredentialType] = useState('https://credential/metaData/');
    const [isHolderRevocable, setIsHolderRevocable] = useState(true);

    const [revocationKeys, setRevocationKeys] = useState<string[]>([]);
    const [revocationKeyInput, setRevocationKeyInput] = useState(
        '8fe0dc02ffbab8d30410233ed58b44a53c418b368ae91cdcdbcdb9e79358be82'
    );

    const [schemas, setSchemas] = useState<object[]>([]);
    const [credentialTypes, setCredentialTypes] = useState<string[]>([]);
    const [credentialSchemaURLs, setCredentialSchemaURLs] = useState<string[]>([]);
    const [credentialTypeInput, setCredentialTypeInput] = useState('myType');
    const [credentialSchemaURLInput, setCredentialSchemaURLInput] = useState('https://credentialSchema/metaData/');

    const [validFromDate, setValidFromDate] = useState('2022-06-12T07:30');
    const [validUntilDate, setValidUntilDate] = useState('2025-06-12T07:30');

    const [writeDropDown, setWriteDropDown] = useState('');
    const [hasInputParameter, setHasInputParameter] = useState(false);

    const [isPayable, setIsPayable] = useState(false);

    const [cCDAmount, setCCDAmount] = useState('');

    const [base64Module, setBase64Module] = useState('');
    const [base64Schema, setBase64Schema] = useState('');

    const handleValidFromDateChange = (event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setValidFromDate(target.value);
    };

    const handleValidUntilDateChange = (event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setValidUntilDate(target.value);
    };

    const changePublicKeyHandler = (event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setPublicKey(target.value);
    };

    const changeModuleReferenceHandler = (event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setModuleReference(target.value);
    };

    const changeCredentialMetaDataURLHandler = (event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setCredentialMetaDataURL(target.value);
    };

    const changeCredentialTypeHandler = (event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setCredentialType(target.value);
    };

    const changeCredentialRegistryContratIndexHandler = (event: ChangeEvent) => {
        const target = event.target as HTMLTextAreaElement;
        setCredentialRegistryContratIndex(Number(target.value));
    };

    const changeWriteDropDownHandler = () => {
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
                            setBrowserPublicKey(
                                value.accountCredentials[0].value.contents.credentialPublicKeys.keys[0].verifyKey
                            );
                        }
                        setViewError('');
                    })
                    .catch((e) => {
                        setAccountBalance('');
                        setBrowserPublicKey('');
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
                        setBrowserPublicKey(
                            value.accountCredentials[0].value.contents.credentialPublicKeys.keys[0].verifyKey
                        );
                    }
                    setViewError('');
                })
                .catch((e) => {
                    setViewError((e as Error).message);
                    setAccountBalance('');
                    setBrowserPublicKey('');
                });
        }
    }, [connection, account]);

    const changeInputParameterHandler = (event: ChangeEvent) => {
        const inputTextArea = document.getElementById('inputParameter');
        inputTextArea?.setAttribute('style', `height:${inputTextArea.scrollHeight}px;overflow-y:hidden;`);

        const target = event.target as HTMLTextAreaElement;
        setInputParameter(JSON.parse(target.value));
    };

    return (
        <main className="container">
            <div className="textCenter">
                Version: {version}
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
                        <div className="col-lg-6">
                            <TestBox
                                header="Step 1: Deploy Smart Contract Module"
                                note="
                                        Expected result after pressing the button and confirming in wallet: The
                                        transaction hash or an error message should appear in the right column.
                                        "
                            >
                                <section>
                                    <input className="btn btn-primary" type="file" id="moduleFile" />
                                    <br />
                                    <button
                                        className="btn btn-primary"
                                        type="button"
                                        onClick={async () => {
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
                                    >
                                        Upload Smart Contract Module
                                    </button>
                                    {uploadError !== '' && (
                                        <div className="alert alert-danger" role="alert">
                                            Error: {uploadError}.
                                        </div>
                                    )}
                                    <br />
                                    {base64Module && (
                                        <div className="actionResultBox">
                                            Module in base64:
                                            <div>{base64Module}</div>
                                        </div>
                                    )}
                                </section>
                                <button
                                    className="btn btn-primary"
                                    type="button"
                                    onClick={() => {
                                        setTxHash('');
                                        setTransactionError('');
                                        const tx = deploy(connection, account, base64Module);
                                        tx.then(setTxHash).catch((err: Error) =>
                                            setTransactionError((err as Error).message)
                                        );
                                    }}
                                >
                                    Deploy smart contract module
                                </button>
                            </TestBox>
                            <TestBox
                                header="Step 2: Initialize Smart Contract"
                                note="
                                        Expected result after pressing the button and confirming in wallet: The
                                        transaction hash or an error message should appear in the right column.
                                        "
                            >
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
                                    <div> Init function has NO input parameter</div>
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
                                    <div>Init function has input parameter</div>
                                </div>
                                {hasInputParameter && (
                                    <>
                                        <section>
                                            <input className="btn btn-primary" type="file" id="schemaFile" />
                                            <br />
                                            <button
                                                className="btn btn-primary"
                                                type="button"
                                                onClick={async () => {
                                                    setUploadError2('');

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
                                            >
                                                Upload Smart Contract Schema
                                            </button>
                                            {uploadError2 !== '' && (
                                                <div className="alert alert-danger" role="alert">
                                                    Error: {uploadError2}.
                                                </div>
                                            )}
                                            <br />
                                            {base64Schema && (
                                                <div className="actionResultBox">
                                                    Schema in base64:
                                                    <div>{base64Schema}</div>
                                                </div>
                                            )}
                                        </section>
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
                                                Add your input parameter:
                                                <br />
                                                <textarea id="inputParameter" onChange={changeInputParameterHandler} />
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
                                        setTxHash('');
                                        setTransactionError('');
                                        const tx = initializeSmartContract(
                                            connection,
                                            account,
                                            moduleReference,
                                            inputParameter,
                                            initName,
                                            base64Schema,
                                            cCDAmount
                                        );
                                        tx.then(setTxHash).catch((err: Error) =>
                                            setTransactionError((err as Error).message)
                                        );
                                    }}
                                >
                                    Initialize Smart Contract
                                </button>
                            </TestBox>
                        </div>
                    )}
                    <div className="col-lg-6">
                        <div className="sticky-top">
                            <br />
                            <h5>
                                This column refreshes every few seconds to update your account balanace. It displays
                                your connected account, transaction hashes, and error messages.
                            </h5>
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
                            <div className="label">
                                Error or Transaction status
                                {txHash === '' ? ':' : ' (May take a moment to finalize):'}
                            </div>
                            <br />
                            {!txHash && !transactionError && (
                                <div className="actionResultBox" role="alert">
                                    IMPORTANT: After pressing a button on the left side that should send a transaction,
                                    the transaction hash or error returned by the wallet are displayed HERE.
                                </div>
                            )}
                            {!txHash && transactionError && (
                                <div className="alert alert-danger" role="alert">
                                    Error: {transactionError}.
                                </div>
                            )}
                            {viewError && (
                                <div className="alert alert-danger" role="alert">
                                    Error: {viewError}.
                                </div>
                            )}
                            {txHash && (
                                <a
                                    className="link"
                                    target="_blank"
                                    rel="noreferrer"
                                    href={`https://testnet.ccdscan.io/?dcount=1&dentity=transaction&dhash=${txHash}`}
                                >
                                    {txHash}
                                </a>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
