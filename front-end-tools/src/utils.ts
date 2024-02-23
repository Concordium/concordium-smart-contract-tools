import {
    toBuffer,
    InvokeContractFailedResult,
    RejectedReceive,
    deserializeReceiveError,
    EntrypointName,
    ContractName,
} from '@concordium/web-sdk';
import { EXAMPLE_ARRAYS, EXAMPLE_JSON_OBJECT } from './constants';

export function arraysEqual(a: Uint8Array, b: Uint8Array) {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (a.length !== b.length) return false;

    for (let i = 0; i < a.length; i += 1) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

export function getObjectExample(template: string | undefined) {
    return template !== undefined
        ? JSON.stringify(JSON.parse(template), undefined, 2)
        : JSON.stringify(EXAMPLE_JSON_OBJECT, undefined, 2);
}

export function getArrayExample(template: string | undefined) {
    return template !== undefined ? JSON.stringify(JSON.parse(template), undefined, 2) : EXAMPLE_ARRAYS;
}

/**
 * Decodes the reason for the transaction failure into a human-readable format.
 *
 * If the error is NOT caused by a smart contract logical revert, this function returns the reason in a human-readable format as follows:
 * - `a human-readable rejectReason tag`. This can happen for example if the transaction runs out of energy. Such errors have tags that are human-readable (e.g. "OutOfEnergy").
 *
 * If the error is caused by a smart contract logical revert coming from the `concordium-std` crate, this function returns the reason in a human-readable format as follows:
 * - `a human-readable error string` decoded from the `concordium-std` crate error codes.
 *
 * If the error is caused by a smart contract logical revert coming from the smart contract itself, this function returns the reason as follows:
 *  - `a rejectReason code` if NO error schema is provided (e.g. -1, -2, -3, ...).
 *  - `a human-readable error string` if an error schema is provided in the moduleSchema. This error schema is used to decode the above `rejectReason code` into a human-readable string.
 *
 * @param failedResult the failed invoke contract result.
 * @param contractName the name of the contract.
 * @param entryPoint the entry point name.
 * @param moduleSchema an optional module schema including an error schema. If provided, the rejectReason code as logged by the smart contract can be decoded into a human-readable error string.
 *
 * @returns a decoded human-readable reject reason string (or falls back to return the error codes if decoding is impossible).
 */
export function decodeRejectReason(
    failedResult: InvokeContractFailedResult,
    contractName: ContractName.Type,
    entryPoint: EntrypointName.Type,
    moduleSchema: string | undefined
) {
    let rejectReason;

    const errorReason = failedResult.reason;

    if (errorReason.tag === 'RejectedReceive') {
        // If the error is due to a logical smart contract revert (`RejectedReceive` type), get the `rejectReason` code.
        // e.g. -1, -2, ... (if the error comes from the smart contract).
        // e,g, -2147483647, -2147483646, ... (if the error comes from the `concordium-std` crate).
        rejectReason = ((failedResult as InvokeContractFailedResult)?.reason as RejectedReceive)?.rejectReason;

        switch (rejectReason) {
            // Check if the `rejectReason` comes from the `concordium-std` crate, and decode it into human-readable strings.
            case -2147483647:
                rejectReason = 'Error ()';
                break;
            case -2147483646:
                rejectReason = 'ParseError';
                break;
            case -2147483645:
                rejectReason = 'LogError::Full';
                break;
            case -2147483644:
                rejectReason = 'LogError::Malformed';
                break;
            case -2147483643:
                rejectReason = 'NewContractNameError::MissingInitPrefix';
                break;
            case -2147483642:
                rejectReason = 'NewContractNameError::TooLong';
                break;
            case -2147483641:
                rejectReason = 'NewReceiveNameError::MissingDotSeparator';
                break;
            case -2147483640:
                rejectReason = 'NewReceiveNameError::TooLong';
                break;
            case -2147483639:
                rejectReason = 'NewContractNameError::ContainsDot';
                break;
            case -2147483638:
                rejectReason = 'NewContractNameError::InvalidCharacters';
                break;
            case -2147483637:
                rejectReason = 'NewReceiveNameError::InvalidCharacters';
                break;
            case -2147483636:
                rejectReason = 'NotPayableError';
                break;
            case -2147483635:
                rejectReason = 'TransferError::AmountTooLarge';
                break;
            case -2147483634:
                rejectReason = 'TransferError::MissingAccount';
                break;
            case -2147483633:
                rejectReason = 'CallContractError::AmountTooLarge';
                break;
            case -2147483632:
                rejectReason = 'CallContractError::MissingAccount';
                break;
            case -2147483631:
                rejectReason = 'CallContractError::MissingContract';
                break;
            case -2147483630:
                rejectReason = 'CallContractError::MissingEntrypoint';
                break;
            case -2147483629:
                rejectReason = 'CallContractError::MessageFailed';
                break;
            case -2147483628:
                rejectReason = 'CallContractError::LogicReject';
                break;
            case -2147483627:
                rejectReason = 'CallContractError::Trap';
                break;
            case -2147483626:
                rejectReason = 'UpgradeError::MissingModule';
                break;
            case -2147483625:
                rejectReason = 'UpgradeError::MissingContract';
                break;
            case -2147483624:
                rejectReason = 'UpgradeError::UnsupportedModuleVersion';
                break;
            case -2147483623:
                rejectReason = 'QueryAccountBalanceError';
                break;
            case -2147483622:
                rejectReason = 'QueryContractBalanceError';
                break;
            default:
                // If the `rejectReason` comes from the smart contract itself (e.g. -1, -2, -3, ...) and an error schema is provided in the module schema, deserialize the reject reason into a human-readable string.
                if (moduleSchema !== undefined) {
                    // Note: The rejectReason codes are converted to the byte tags of the enum type in Rust. Errors are represented as an enum type in Concordium smart contracts.
                    // -1 => 0x00
                    // -2 => 0x01
                    // -3 => 0x02
                    // -4 => 0x03
                    // ...
                    // This conversion works as long as there are no more then 256 (one byte) of different errors in the smart contract which should be sufficient for practical smart contracts.
                    const decodedError = deserializeReceiveError(
                        Uint8Array.from([Math.abs(rejectReason) - 1]).buffer,
                        toBuffer(moduleSchema, 'base64'),
                        contractName,
                        entryPoint
                    );

                    // The object only includes one key. Its key is the human-readable error string.
                    const key = Object.keys(decodedError);

                    // Convert the human-readable error to a JSON string.
                    return JSON.stringify(key);
                }
        }
    } else {
        // If the error is not due to a logical smart contract revert, return the `errorReasonTag` instead (e.g. if the transactions runs out of energy)
        rejectReason = errorReason.tag;
    }

    return rejectReason;
}
