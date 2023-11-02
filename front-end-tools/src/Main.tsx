/* eslint-disable no-console */
import React, { useEffect, useState } from 'react';

import {
    WalletConnectionProps,
    useConnection,
    useConnect,
    useGrpcClient,
    TESTNET,
    MAINNET,
    useWalletConnectorSelector,
} from '@concordium/react-components';
import { AccountAddress } from '@concordium/web-sdk';

import DeployComponent from './DeployComponent';
import ReadComponent from './ReadComponent';
import WriteComponent from './WriteComponent';
import InitComponent from './InitComponent';

import { BROWSER_WALLET, REFRESH_INTERVAL } from './constants';
import { AccountLink } from './CCDScanLinks';

interface ConnectionProps {
    walletConnectionProps: WalletConnectionProps;
    isTestnet: boolean;
}

export default function Main(props: ConnectionProps) {
    // Network state
    const { walletConnectionProps, isTestnet } = props;
    const { activeConnectorType, activeConnector, activeConnectorError, connectedAccounts, genesisHashes } =
        walletConnectionProps;
    const { connection, setConnection, account } = useConnection(connectedAccounts, genesisHashes);
    const { isConnected, select } = useWalletConnectorSelector(BROWSER_WALLET, connection, {
        ...walletConnectionProps,
    });
    const { connect, connectError } = useConnect(activeConnector, setConnection);

    const client = useGrpcClient(isTestnet ? TESTNET : MAINNET);

    // Account state
    const [viewErrorAccountInfo, setViewErrorAccountInfo] = useState<string | undefined>(undefined);
    const [accountExistsOnNetwork, setAccountExistsOnNetwork] = useState(true);
    const [accountBalance, setAccountBalance] = useState<string | undefined>(undefined);

    // Shared state between deploy step and init step
    const [moduleReferenceCalculated, setModuleReferenceCalculated] = useState<string | undefined>(undefined);
    const [moduleReferenceDeployed, setModuleReferenceDeployed] = useState<string | undefined>(undefined);
    const [contracts, setContracts] = useState<string[]>([]);
    const [embeddedModuleSchemaBase64Init, setEmbeddedModuleSchemaBase64Init] = useState<string | undefined>(undefined);

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
                            <br />
                            <div className="label">Connected account:</div>
                            <AccountLink isTestnet={isTestnet} account={account} />
                            <br />
                            {accountBalance && (
                                <>
                                    <div className="label">Your account balance:</div>
                                    <div>{accountBalance.replace(/(\d)(?=(\d\d\d\d\d\d)+(?!\d))/g, '$1.')} CCD</div>
                                </>
                            )}

                            <DeployComponent
                                isTestnet={isTestnet}
                                connection={connection}
                                account={account}
                                client={client}
                                setContracts={setContracts}
                                moduleReferenceDeployed={moduleReferenceDeployed}
                                moduleReferenceCalculated={moduleReferenceCalculated}
                                setModuleReferenceDeployed={setModuleReferenceDeployed}
                                setModuleReferenceCalculated={setModuleReferenceCalculated}
                                setEmbeddedModuleSchemaBase64Init={setEmbeddedModuleSchemaBase64Init}
                            />

                            <InitComponent
                                isTestnet={isTestnet}
                                connection={connection}
                                account={account}
                                client={client}
                                contracts={contracts}
                                moduleReferenceDeployed={moduleReferenceDeployed}
                                moduleReferenceCalculated={moduleReferenceCalculated}
                                embeddedModuleSchemaBase64Init={embeddedModuleSchemaBase64Init}
                            />

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
                            <br />
                        </div>
                    )}
                </div>
            )}
        </main>
    );
}
