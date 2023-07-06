import { BrowserWalletConnector, ephemeralConnectorType } from '@concordium/react-components';
import moment from 'moment';

export const REFRESH_INTERVAL = moment.duration(5, 'seconds');

export const BROWSER_WALLET = ephemeralConnectorType(BrowserWalletConnector.create);

export const DEFAULT_JSON_OBJECT = {
    myStringField: 'FieldValue',
    myNumberField: 4,
    myArray: [1, 2, 3],
    myObject: {
        myField1: 'FieldValue',
    },
};

export const DEFAULT_ARRAY_OBJECT = 'Examples: \n\n[1,2,3] or \n\n["abc","def"] or \n\n[{"myFieldKey":"myFieldValue"}]';
