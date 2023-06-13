import { JsonRpcClient } from '@concordium/web-sdk';

export async function accountInfo(rpcClient: JsonRpcClient, account: string) {
    return rpcClient.getAccountInfo(account);
}
