import React from 'react';
import { Network } from '@concordium/react-components';

interface TxHashLinkProps {
    network: Network;
    txHash: string;
    message: string;
}

/**
 * A component that displays the CCDScan link of a transaction hash.
 * A message at the bottom can be used to add some custom description to the link.
 * If `isTestnet` is true, the testnet CCDScan link is displayed.
 * If `isTestnet` is false, the mainnet CCDScan link is displayed.
 */
export const TxHashLink = function TxHashLink(props: TxHashLinkProps) {
    const { network, txHash, message } = props;

    return (
        <>
            <div>
                Transaction hash:{' '}
                <a
                    className="link"
                    target="_blank"
                    rel="noreferrer"
                    href={`${network.ccdScanBaseUrl}/?dcount=1&dentity=transaction&dhash=${txHash}`}
                >
                    {txHash}
                </a>
            </div>
            <br />
            <div>
                CCDScan will take a moment to pick up the above transaction, hence the above link will work in a bit.
            </div>
            <div>{message}</div>
        </>
    );
};

interface AccountLinkProps {
    network: Network;
    account: string;
}

/**
 * A component that displays the CCDScan link to an account address.
 * If `isTestnet` is true, the testnet CCDScan link is displayed.
 * If `isTestnet` is false, the mainnet CCDScan link is displayed.
 */
export const AccountLink = function AccountLink(props: AccountLinkProps) {
    const { network, account } = props;

    return (
        <div>
            <a
                className="link"
                href={`${network.ccdScanBaseUrl}/?dcount=1&dentity=account&daddress=${account}`}
                target="_blank"
                rel="noreferrer"
            >
                {account}
            </a>
        </div>
    );
};
