import React, { useState } from 'react';

import { WithWalletConnector, TESTNET, MAINNET } from '@concordium/react-components';
import Switch from 'react-switch';
import Main from './Main';
import { version } from '../package.json';

/**
 * Select mainnet/testnet and display WithWalletConnector component for respective network.
 */
export default function Root() {
    const [isTestnet, setIsTestnet] = useState(true);

    return (
        <div>
            <main className="textCenter">
                <div className="version">Version: {version}</div>
                <h1>Deploy and Initialize Smart Contracts on Concordium {isTestnet ? 'Testnet' : 'Mainnet'}</h1>
                <br />
                <div className="switch-wrapper">
                    <div>Testnet</div>
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
                    <div>Mainnet</div>
                </div>
                <br />
                {/* Changes to the network value will remove the activeConnector. We switch between components here without changing the network value. */}
                {isTestnet && (
                    <WithWalletConnector network={TESTNET}>
                        {(props) => <Main walletConnectionProps={props} isTestnet={isTestnet} />}
                    </WithWalletConnector>
                )}
                {!isTestnet && (
                    <WithWalletConnector network={MAINNET}>
                        {(props) => <Main walletConnectionProps={props} isTestnet={isTestnet} />}
                    </WithWalletConnector>
                )}
            </main>
        </div>
    );
}
