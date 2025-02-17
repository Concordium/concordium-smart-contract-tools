import {
    BrowserWalletConnector,
    ephemeralConnectorType,
    MAINNET,
    Network,
    TESTNET,
} from '@concordium/react-components';
import moment from 'moment';

// The refresh interval is used by polling at the front end.
export const REFRESH_INTERVAL = moment.duration(5, 'seconds');

export const BROWSER_WALLET = ephemeralConnectorType(BrowserWalletConnector.create);

export const STAGENET_GENESIS_BLOCK_HASH = '853288fa5a45554d3cbbf8a756b85abcbfddf28e752b13223eb747209a4d0d3c';
/**
 * Standard configuration for the Stagenet network.
 */
export const STAGENET: Network = {
    name: 'stagenet',
    genesisHash: STAGENET_GENESIS_BLOCK_HASH,
    grpcOpts: {
        baseUrl: 'https://grpc.stagenet.concordium.com:20000',
    },
    ccdScanBaseUrl: 'https://stagenet.ccdscan.io/',
};

export type SelectedNetworkOption = { value: Network; label: string };

// Available blockchain network options supported by the front-end.
const MAINNET_SELECT_OPTION: SelectedNetworkOption = { value: MAINNET, label: 'mainnet' };
const TESTNET_SELECT_OPTION: SelectedNetworkOption = { value: TESTNET, label: 'testnet' };
const STAGENET_SELECT_OPTION: SelectedNetworkOption = { value: STAGENET, label: 'stagenet' };

// All blockchain network options supported by the front-end.
export const AVAILABLE_NETWORKS = [MAINNET_SELECT_OPTION, TESTNET_SELECT_OPTION, STAGENET_SELECT_OPTION];

// This is the example JSON object that is shown in the input parameter textarea as a placeholder when the user has no embedded schema in the module
// or does not want to use the embedded schema (meaning if the checkbox "Use module from step 1" is unchecked).
export const EXAMPLE_JSON_OBJECT = {
    myStringField: 'FieldValue',
    myNumberField: 4,
    myArray: [1, 2, 3],
    myObject: {
        myField1: 'FieldValue',
    },
};

// These are the example arrays that are shown in the input parameter textarea as a placeholder when the user has no embedded schema in the module
// or does not want to use the embedded schema (meaning if the checkbox "Use module from step 1" is unchecked).
export const EXAMPLE_ARRAYS = 'Examples: \n\n[1,2,3] or \n\n["abc","def"] or \n\n[{"myFieldKey":"myFieldValue"}]';

// Available options for the input parameter type in step 2.
export const INPUT_PARAMETER_TYPE_NUMBER = { label: 'number', value: 'number' };
export const INPUT_PARAMETER_TYPE_STRING = { label: 'string', value: 'string' };
export const INPUT_PARAMETER_TYPE_OBJECT = { label: 'object', value: 'object' };
export const INPUT_PARAMETER_TYPE_ARRAY = { label: 'array', value: 'array' };

// All available options for the input parameter type in step 2.
export const INPUT_PARAMETER_TYPES_OPTIONS = [
    INPUT_PARAMETER_TYPE_NUMBER,
    INPUT_PARAMETER_TYPE_STRING,
    INPUT_PARAMETER_TYPE_OBJECT,
    INPUT_PARAMETER_TYPE_ARRAY,
];

// The subindex of all smart contracts.
export const CONTRACT_SUB_INDEX = 0n;

// Regular expression of a valid module reference which has to be a hex string `[0-9A-Fa-f]` of length 64.
export const REG_MODULE_REF = /^[0-9A-Fa-f]{64}$/;

const MODULE_REFERENCE_PLACEHOLDER_STAGENET = '65b56d70c1c01a1b0289bd614f138cfb1659702d567b5fea24c128d795dfa5e7'; // Factory contract
const MODULE_REFERENCE_PLACEHOLDER_TESTNET = 'cc285180b45d7695db75c29dee004d2e81a1383880c9b122399bea809196c98f'; // wccd contract
const MODULE_REFERENCE_PLACEHOLDER_MAINNET = 'f7d13649702c6d24ebd784631beceea79773b10f16f99e21cf81ef8f755b5d44'; // EUROe contract

// Module reference displayed as placeholder in the input field.
export const MODULE_REFERENCE_PLACEHOLDER_MAP = new Map<string, string>([
    ['stagenet', MODULE_REFERENCE_PLACEHOLDER_STAGENET],
    ['testnet', MODULE_REFERENCE_PLACEHOLDER_TESTNET],
    ['mainnet', MODULE_REFERENCE_PLACEHOLDER_MAINNET],
]);

// Available options to select in step 2 for deriving values from the module reference.
export const DO_NOT_DERIVE = { value: "Don't derive", label: "Don't derive" };
export const DERIVE_FROM_STEP_1 = { value: 'Derive from step 1', label: 'Derive from step 1' };
export const DERIVE_FROM_CHAIN = { value: 'Derive from chain', label: 'Derive from chain' };

// All available options to select in step 2 for deriving values from the module reference.
export const OPTIONS_DERIVE_FROM_MODULE_REFERENCE = [DO_NOT_DERIVE, DERIVE_FROM_STEP_1, DERIVE_FROM_CHAIN];
