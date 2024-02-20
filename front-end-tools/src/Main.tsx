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
import { ModuleReference } from '@concordium/web-sdk';

import { Alert } from 'react-bootstrap';
import DeployComponent from './components/DeployComponent';
import ReadComponent from './components/ReadComponent';
import UpdateComponent from './components/UpdateComponent';
import InitComponent from './components/InitComponent';
import { AccountLink } from './components/CCDScanLinks';
import { getAccountInfo } from './reading_from_blockchain';

import { BROWSER_WALLET, REFRESH_INTERVAL } from './constants';

interface ConnectionProps {
    walletConnectionProps: WalletConnectionProps;
    isTestnet: boolean;
}

/** The main component manages the connection to the browser wallet and
 * combines the rest of the components (DeployComponent, InitComponent, ReadComponent, and UpdateComponent) to form the page.
 * The connected account address, and its balance are displayed at the top. Links for further reading are displayed at the bottom.
 */
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
    const [moduleReferenceCalculated, setModuleReferenceCalculated] = useState<ModuleReference.Type | undefined>(
        undefined
    );

    // Refresh accountInfo periodically.
    // eslint-disable-next-line consistent-return
    useEffect(() => {
        if (connection && client && account) {
            const interval = setInterval(() => {
                getAccountInfo(client, account, setAccountBalance, setAccountExistsOnNetwork, setViewErrorAccountInfo);
            }, REFRESH_INTERVAL.asMilliseconds());
            return () => clearInterval(interval);
        }
    }, [connection, account, client]);

    useEffect(() => {
        if (connection && client && account) {
            getAccountInfo(client, account, setAccountBalance, setAccountExistsOnNetwork, setViewErrorAccountInfo);
        }
    }, [connection, account, client]);

    useEffect(() => {
        select();
    }, []);

    return (
        <main className="container">
            <div className="textCenter">
                <br />
                {activeConnectorError && <Alert variant="danger">Connector Error: {activeConnectorError}.</Alert>}
                {!activeConnectorError && activeConnectorType && !activeConnector && (
                    <p>
                        <i>Loading connector...</i>
                    </p>
                )}
                {connectError && <Alert variant="danger">Connect Error: {connectError}.</Alert>}
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
                                moduleReferenceCalculated={moduleReferenceCalculated}
                                setModuleReferenceCalculated={setModuleReferenceCalculated}
                            />

                            <InitComponent
                                isTestnet={isTestnet}
                                connection={connection}
                                account={account}
                                client={client}
                                moduleReferenceCalculated={moduleReferenceCalculated}
                            />

                            <ReadComponent connection={connection} account={account} client={client} />

                            <UpdateComponent
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
