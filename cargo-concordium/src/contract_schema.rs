use concordium_base::contracts_common::{
    schema::{ContractV0, ContractV1, ContractV2, ContractV3, VersionedModuleSchema},
    to_bytes,
};

// -------------------- Helper Functions -------------------- //

/// Based on the list of receive names compute the colon position for aligning
/// prints.
fn get_colon_position<'a>(iter: impl Iterator<Item = &'a str>) -> usize {
    let max_length_receive_opt = iter.map(|n| n.chars().count()).max();
    max_length_receive_opt.map_or(5, |m| m.max(5))
}

/// Print the summary of the contract schema.
fn print_schema_info(contract_name: &str, len: usize) {
    eprintln!(
        "\n     Contract schema: '{}' in total {} B.",
        contract_name, len,
    );
}

/// Print the contract name and its entrypoints
fn print_contract_schema_v0(contract_name: &str, contract_schema: &ContractV0) {
    let receive_iter = contract_schema.receive.keys().map(|n| n.as_str());
    let colon_position = get_colon_position(receive_iter);

    print_schema_info(contract_name, to_bytes(contract_schema).len());

    if let Some(state_schema) = &contract_schema.state {
        eprintln!("       state   : {} B", to_bytes(state_schema).len());
    }
    if let Some(init_schema) = &contract_schema.init {
        eprintln!("       init    : {} B", to_bytes(init_schema).len())
    }

    if !contract_schema.receive.is_empty() {
        eprintln!("       receive");
        for (method_name, param_type) in contract_schema.receive.iter() {
            eprintln!(
                "        - {:width$} : {} B",
                format!("'{}'", method_name),
                to_bytes(param_type).len(),
                width = colon_position + 2
            );
        }
    }
}

/// Print the contract name and its entrypoints.
fn print_contract_schema_v1(contract_name: &str, contract_schema: &ContractV1) {
    let receive_iter = contract_schema.receive.keys().map(|n| n.as_str());
    let colon_position = get_colon_position(receive_iter);

    print_schema_info(contract_name, to_bytes(contract_schema).len());

    if let Some(init_schema) = &contract_schema.init {
        eprintln!("       init    : {} B", to_bytes(init_schema).len())
    }

    if !contract_schema.receive.is_empty() {
        eprintln!("       receive");
        for (method_name, param_type) in contract_schema.receive.iter() {
            eprintln!(
                "        - {:width$} : {} B",
                format!("'{}'", method_name),
                to_bytes(param_type).len(),
                width = colon_position + 2
            );
        }
    }
}

/// Print the contract name and its entrypoints.
fn print_contract_schema_v2(contract_name: &str, contract_schema: &ContractV2) {
    let receive_iter = contract_schema.receive.keys().map(|n| n.as_str());
    let colon_position = get_colon_position(receive_iter);

    print_schema_info(contract_name, to_bytes(contract_schema).len());

    if let Some(init_schema) = &contract_schema.init {
        eprintln!("       init    : {} B", to_bytes(init_schema).len())
    }

    if !contract_schema.receive.is_empty() {
        eprintln!("       receive");
        for (method_name, param_type) in contract_schema.receive.iter() {
            eprintln!(
                "        - {:width$} : {} B",
                format!("'{}'", method_name),
                to_bytes(param_type).len(),
                width = colon_position + 2
            );
        }
    }
}

/// Print the contract name and its entrypoints.
fn print_contract_schema_v3(contract_name: &str, contract_schema: &ContractV3) {
    let receive_iter = contract_schema.receive.keys().map(|n| n.as_str());
    let colon_position = get_colon_position(receive_iter);

    print_schema_info(contract_name, to_bytes(contract_schema).len());

    if let Some(init_schema) = &contract_schema.init {
        eprintln!("       init    : {} B", to_bytes(init_schema).len())
    }

    if let Some(event_schema) = &contract_schema.event {
        eprintln!("       event   : {} B", to_bytes(event_schema).len())
    }

    if !contract_schema.receive.is_empty() {
        eprintln!("       receive");
        for (method_name, param_type) in contract_schema.receive.iter() {
            eprintln!(
                "        - {:width$} : {} B",
                format!("'{}'", method_name),
                to_bytes(param_type).len(),
                width = colon_position + 2
            );
        }
    }
}

// -------------------- Export Functions -------------------- //

/// Print the contract name and its entrypoints
pub(crate) fn print_contract_schema(module_schema: &VersionedModuleSchema) {
    eprintln!("\n   Module schema includes:");
    match module_schema {
        VersionedModuleSchema::V0(module_schema) => {
            for (contract_name, contract_schema) in module_schema.contracts.iter() {
                print_contract_schema_v0(contract_name, contract_schema);
            }
        }
        VersionedModuleSchema::V1(module_schema) => {
            for (contract_name, contract_schema) in module_schema.contracts.iter() {
                print_contract_schema_v1(contract_name, contract_schema);
            }
        }
        VersionedModuleSchema::V2(module_schema) => {
            for (contract_name, contract_schema) in module_schema.contracts.iter() {
                print_contract_schema_v2(contract_name, contract_schema);
            }
        }
        VersionedModuleSchema::V3(module_schema) => {
            for (contract_name, contract_schema) in module_schema.contracts.iter() {
                print_contract_schema_v3(contract_name, contract_schema);
            }
        }
    };
}
