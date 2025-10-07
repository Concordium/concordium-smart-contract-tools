//! Simple smart contract module implementation for testing reproducible builds.
//! The CI pipeline will build and verify a build of this smart contract during release of a new docker image for reproducible builds using cargo-concordium.
use concordium_std::*;

#[derive(Debug, SchemaType, Serialize, PartialEq, Eq, Clone, Copy)]
enum PiggyBankState {
    Intact,
    Smashed,
}

#[init(contract = "PiggyBank")]
fn piggy_init(_ctx: &InitContext, _state_builder: &mut StateBuilder) -> InitResult<PiggyBankState> {
    Ok(PiggyBankState::Intact)
}

#[receive(contract = "PiggyBank", name = "insert", payable)]
fn piggy_insert(
    _ctx: &ReceiveContext,
    host: &Host<PiggyBankState>,
    _amount: Amount,
) -> ReceiveResult<()> {
    ensure!(*host.state() == PiggyBankState::Intact);
    Ok(())
}

#[receive(contract = "PiggyBank", name = "smash", mutable)]
fn piggy_smash(ctx: &ReceiveContext, host: &mut Host<PiggyBankState>) -> ReceiveResult<()> {
    let owner = ctx.owner();
    let sender = ctx.sender();

    ensure!(sender.matches_account(&owner));
    ensure!(*host.state() == PiggyBankState::Intact);
    *host.state_mut() = PiggyBankState::Smashed;

    let balance = host.self_balance();
    Ok(host.invoke_transfer(&owner, balance)?)
}
