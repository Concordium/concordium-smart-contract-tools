import {
    toBuffer,
    InvokeContractFailedResult,
    RejectedReceive,
    deserializeReceiveError,
    EntrypointName,
    ContractName,
    ReturnValue,
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
    let rejectReasonCode;

    const errorReason = failedResult.reason;

    let humanReadableError;

    if (errorReason.tag === 'RejectedReceive') {
        // If the error is due to a logical smart contract revert (`RejectedReceive` type), get the `rejectReason` code.
        // e.g. -1, -2, ... (if the error comes from the smart contract).
        // e,g, -2147483647, -2147483646, ... (if the error comes from the `concordium-std` crate).
        rejectReasonCode = ((failedResult as InvokeContractFailedResult)?.reason as RejectedReceive)?.rejectReason;

        switch (rejectReasonCode) {
            // Check if the `rejectReason` comes from the `concordium-std` crate, and decode it into human-readable strings.
            case -2147483647:
                humanReadableError = '`[Error ()]`';
                break;
            case -2147483646:
                humanReadableError = '`[ParseError]`';
                break;
            case -2147483645:
                humanReadableError = '`[LogError::Full]`';
                break;
            case -2147483644:
                humanReadableError = '`[LogError::Malformed]`';
                break;
            case -2147483643:
                humanReadableError = '`[NewContractNameError::MissingInitPrefix]`';
                break;
            case -2147483642:
                humanReadableError = '`[NewContractNameError::TooLong]`';
                break;
            case -2147483641:
                humanReadableError = '`[NewReceiveNameError::MissingDotSeparator]`';
                break;
            case -2147483640:
                humanReadableError = '`[NewReceiveNameError::TooLong]`';
                break;
            case -2147483639:
                humanReadableError = '`[NewContractNameError::ContainsDot]`';
                break;
            case -2147483638:
                humanReadableError = '`[NewContractNameError::InvalidCharacters]`';
                break;
            case -2147483637:
                humanReadableError = '`[NewReceiveNameError::InvalidCharacters]`';
                break;
            case -2147483636:
                humanReadableError = '`[NotPayableError]`';
                break;
            case -2147483635:
                humanReadableError = '`[TransferError::AmountTooLarge]`';
                break;
            case -2147483634:
                humanReadableError = '`[TransferError::MissingAccount]`';
                break;
            case -2147483633:
                humanReadableError = '`[CallContractError::AmountTooLarge]`';
                break;
            case -2147483632:
                humanReadableError = '`[CallContractError::MissingAccount]`';
                break;
            case -2147483631:
                humanReadableError = '`[CallContractError::MissingContract]`';
                break;
            case -2147483630:
                humanReadableError = '`[CallContractError::MissingEntrypoint]`';
                break;
            case -2147483629:
                humanReadableError = '`[CallContractError::MessageFailed]`';
                break;
            case -2147483628:
                humanReadableError = '`[CallContractError::LogicReject]`';
                break;
            case -2147483627:
                humanReadableError = '`[CallContractError::Trap]`';
                break;
            case -2147483626:
                humanReadableError = '`[UpgradeError::MissingModule]`';
                break;
            case -2147483625:
                humanReadableError = '`[UpgradeError::MissingContract]`';
                break;
            case -2147483624:
                humanReadableError = '`[UpgradeError::UnsupportedModuleVersion]`';
                break;
            case -2147483623:
                humanReadableError = '`[QueryAccountBalanceError]`';
                break;
            case -2147483622:
                humanReadableError = '`[QueryContractBalanceError]`';
                break;
            default:
                // If the `rejectReason` comes from the smart contract itself (e.g. -1, -2, -3, ...) and an error schema is provided in the module schema, deserialize the reject reason into a human-readable string.
                if (moduleSchema !== undefined && failedResult.returnValue !== undefined) {
                    const decodedError = deserializeReceiveError(
                        ReturnValue.toBuffer(failedResult.returnValue),
                        toBuffer(moduleSchema, 'base64'),
                        contractName,
                        entryPoint
                    );

                    // The object only includes one key. Its key is the human-readable error string.
                    const key = Object.keys(decodedError);

                    // Convert the human-readable error to a JSON string.
                    humanReadableError = JSON.stringify(key);
                }
        }
    } else {
        // If the error is not due to a logical smart contract revert, return the `errorReasonTag` instead (e.g. if the transactions runs out of energy)
        humanReadableError = `\`[${errorReason.tag}]\``;
    }

    return [rejectReasonCode, humanReadableError];
}
