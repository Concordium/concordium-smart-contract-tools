import React, { useState } from 'react';

import { WithWalletConnector, Network } from '@concordium/react-components';
import Select from 'react-select';
import Main from './Main';
import { version } from '../package.json';
import { AVAILABLE_NETWORKS } from './constants';

/**
 * Select mainnet/testnet and display WithWalletConnector component for respective network.
 */
export default function Root() {
    const [selectedNetwork, setSelectedNetwork] = useState<Network | undefined>(undefined);

    return (
        <div>
            <main className="textCenter">
                <div className="version">Version: {version}</div>

                <h1>Deploy and Initialize Smart Contracts on Concordium {selectedNetwork?.name}</h1>
                <div style={{ width: '33%', margin: '0 auto' }}>
                    <Select
                        options={AVAILABLE_NETWORKS}
                        placeholder="Choose your network"
                        onChange={(e) => {
                            setSelectedNetwork(e?.value);
                        }}
                    />
                </div>
                <br />
                {selectedNetwork && (
                    <WithWalletConnector network={selectedNetwork}>
                        {(props) => <Main walletConnectionProps={props} />}
                    </WithWalletConnector>
                )}
            </main>
        </div>
    );
}
