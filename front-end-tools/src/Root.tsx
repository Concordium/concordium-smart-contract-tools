import React, { useState } from 'react';

import { WithWalletConnector, TESTNET, MAINNET } from '@concordium/react-components';
import Switch from 'react-switch';
import Main from './Main';
import { version } from '../package.json';

/**
 * Connect to wallet, setup application state context, and render children when the wallet API is ready for use.
 */
export default function Root() {
    const [isTestnet, setIsTestnet] = useState(true);

    return (
        <div>
            <main className="textCenter">
                <div className="version">Version: {version}</div>
                <h1>Deploy and Initialize Smart Contracts on Concordium {isTestnet ? 'Testnet' : 'Mainnet'}</h1>
                <div className="switch-wrapper">
                    <div>Use Testnet</div>
                    <Switch
                        onChange={() => {
                            setIsTestnet(!isTestnet);
                        }}
                        onColor="#308274"
                        offColor="#308274"
                        onHandleColor="#174039"
                        offHandleColor="#174039"
                        checked={!isTestnet}
                        checkedIcon={false}
                        uncheckedIcon={false}
                    />
                    <div>Use Mainnet</div>
                </div>
                <WithWalletConnector network={isTestnet ? TESTNET : MAINNET}>
                    {(props) => <Main walletConnectionProps={props} isTestnet={isTestnet} />}
                </WithWalletConnector>
            </main>
        </div>
    );
}
