import { BrowserWalletConnector, ephemeralConnectorType } from '@concordium/react-components';
import moment from 'moment';

// The refresh interval is used by polling at the front end.
export const REFRESH_INTERVAL = moment.duration(5, 'seconds');

export const BROWSER_WALLET = ephemeralConnectorType(BrowserWalletConnector.create);

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

// The input parameter can have one of these type options.
export const INPUT_PARAMETER_TYPES_OPTIONS = [
    { label: 'number', value: 'number' },
    { label: 'string', value: 'string' },
    { label: 'object', value: 'object' },
    { label: 'array', value: 'array' },
];

// The subindex of all smart contracts.
export const CONTRACT_SUB_INDEX = 0n;

// Characters of a hex string.
export const hexRegex = /^[0-9a-fA-F]+$/;
