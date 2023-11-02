import React from 'react';

interface TxHashLinkProps {
    isTestnet: boolean;
    txHash: string;
    message: string;
}

export const TxHashLink = function TxHashLink(props: TxHashLinkProps) {
    const { isTestnet, txHash, message } = props;

    return (
        <>
            <div>
                Transaction hash:{' '}
                <a
                    className="link"
                    target="_blank"
                    rel="noreferrer"
                    href={`https://${
                        isTestnet ? `testnet.` : ``
                    }ccdscan.io/?dcount=1&dentity=transaction&dhash=${txHash}`}
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
    isTestnet: boolean;
    account: string;
}

export const AccountLink = function AccountLink(props: AccountLinkProps) {
    const { isTestnet, account } = props;

    return (
        <div>
            <a
                className="link"
                href={`https://${isTestnet ? `testnet.` : ``}ccdscan.io/?dcount=1&dentity=account&daddress=${account}`}
                target="_blank"
                rel="noreferrer"
            >
                {account}
            </a>
        </div>
    );
};
