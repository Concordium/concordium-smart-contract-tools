import { BrowserWalletConnector, ephemeralConnectorType, Network } from '@concordium/react-components';
import moment from 'moment';

export const REFRESH_INTERVAL = moment.duration(10, 'seconds');

// The TESTNET_GENESIS_BLOCK_HASH can be used to check that the user has its browser wallet connected to testnet.
export const TESTNET_GENESIS_BLOCK_HASH = '4221332d34e1694168c2a0c0b3fd0f273809612cb13d000d5c2e00e85f50f796';
export const TESTNET: Network = {
    name: 'testnet',
    genesisHash: TESTNET_GENESIS_BLOCK_HASH,
    jsonRpcUrl: 'https://json-rpc.testnet.concordium.com',
    ccdScanBaseUrl: 'https://testnet.ccdscan.io',
    grpcOpts: undefined,
};

export const BROWSER_WALLET = ephemeralConnectorType(BrowserWalletConnector.create);
