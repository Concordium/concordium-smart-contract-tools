import { BrowserWalletConnector, ephemeralConnectorType } from '@concordium/react-components';
import moment from 'moment';

export const REFRESH_INTERVAL = moment.duration(5, 'seconds');

export const BROWSER_WALLET = ephemeralConnectorType(BrowserWalletConnector.create);
