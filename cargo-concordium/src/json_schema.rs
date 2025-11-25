use std::{fs, io::Write, path::Path};

use anyhow::Context;
use base64::Engine;
use concordium_base::contracts_common::{
    schema::{
        self, ContractV0, ContractV1, ContractV2, ContractV3, FunctionV1, FunctionV2,
        VersionedModuleSchema,
    },
    to_bytes,
};
use serde_json::Value;

use crate::utils::ENCODER;

// -------------------- Helper Functions -------------------- //

/// Convert a [schema type](schema::Type) to a base64 string.
fn type_to_json(ty: &schema::Type) -> Value {
    ENCODER.encode(to_bytes(ty)).into()
}

fn function_v1_schema(schema: &FunctionV1) -> Value {
    // create empty function object
    let mut function_object: Value = Value::Object(serde_json::Map::new());

    // add parameter schema to function object
    if let Some(parameter_schema) = &schema.parameter() {
        function_object["parameter"] = type_to_json(parameter_schema);
    }

    // add return_value schema to function object
    if let Some(return_value_schema) = &schema.return_value() {
        function_object["returnValue"] = type_to_json(return_value_schema);
    }
    function_object
}

/// Convert a [`FunctionV2`] schema to a JSON representation.
fn function_v2_schema(schema: &FunctionV2) -> Value {
    // create empty object
    let mut function_object: Value = Value::Object(serde_json::Map::new());

    // add parameter schema
    if let Some(parameter_schema) = &schema.parameter {
        function_object["parameter"] = type_to_json(parameter_schema);
    }

    // add return_value schema
    if let Some(return_value_schema) = &schema.return_value {
        function_object["returnValue"] = type_to_json(return_value_schema);
    }

    // add error schema
    if let Some(error_schema) = &schema.error {
        function_object["error"] = type_to_json(error_schema);
    }
    function_object
}

/// Write the provided JSON value to the file inside the `root` directory.
/// The file is named after contract_name, except if contract_name contains
/// unsuitable characters. Then the counter is used to name the file.
fn write_schema(
    root: &Path,
    contract_name: &str,
    counter: usize,
    mut schema_json: Value,
) -> anyhow::Result<()> {
    schema_json["contractName"] = contract_name.into();

    // make sure the path is valid on all platforms
    let file_name = if contract_name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || "-_[]{}".contains(c))
    {
        contract_name.to_owned() + "_schema.json"
    } else {
        format!("contract-schema_{}.json", counter)
    };

    // save the schema JSON representation into the file
    let out_path = root.join(file_name);

    eprintln!(
        "   Writing JSON schema for {} to {}.",
        contract_name,
        out_path.display()
    );
    if let Some(out_dir) = out_path.parent() {
        fs::create_dir_all(out_dir)
            .context("Unable to create directory for the resulting JSON schemas.")?;
    }
    let mut out_file =
        std::fs::File::create(out_path).context("Unable to create the output file.")?;
    write!(
        &mut out_file,
        "{}",
        serde_json::to_string_pretty(&schema_json)?
    )
    .context("Unable to write schema json output.")?;
    Ok(())
}

/// Converts the ContractV0 schema of the given contract_name to JSON and writes
/// it to a file named after the smart contract name at the specified location.
pub fn write_json_schema_to_file_v0(
    path_of_out: &Path,
    contract_name: &str,
    contract_counter: usize,
    contract_schema: &ContractV0,
) -> anyhow::Result<()> {
    // create empty schema_json
    let mut schema_json: Value = Value::Object(serde_json::Map::new());

    // add init schema
    if let Some(init_schema) = &contract_schema.init {
        schema_json["init"] = type_to_json(init_schema);
    }

    // add state schema
    if let Some(state_schema) = &contract_schema.state {
        schema_json["state"] = type_to_json(state_schema);
    }

    // add receive entrypoints
    if !contract_schema.receive.is_empty() {
        // create empty entrypoints
        let mut entrypoints: Value = Value::Object(serde_json::Map::new());

        // iterate through the entrypoints and add their schemas
        for (method_name, receive_schema) in contract_schema.receive.iter() {
            // add `method_name` entrypoint
            entrypoints[method_name] = type_to_json(receive_schema);
        }

        // add all receive entrypoints
        schema_json["entrypoints"] = entrypoints;
    }

    write_schema(path_of_out, contract_name, contract_counter, schema_json)
}

/// Converts the ContractV1 schema of the given contract_name to JSON and writes
/// it to a file named after the smart contract name at the specified location.
pub fn write_json_schema_to_file_v1(
    path_of_out: &Path,
    contract_name: &str,
    contract_counter: usize,
    contract_schema: &ContractV1,
) -> anyhow::Result<()> {
    // create empty schema_json
    let mut schema_json: Value = Value::Object(serde_json::Map::new());

    // add init schema
    if let Some(init_schema) = &contract_schema.init {
        schema_json["init"] = function_v1_schema(init_schema);
    }

    // add receive entrypoints
    if !contract_schema.receive.is_empty() {
        // create empty entrypoints
        let mut entrypoints: Value = Value::Object(serde_json::Map::new());

        // iterate through the entrypoints and add their schemas
        for (method_name, receive_schema) in contract_schema.receive.iter() {
            // add `method_name` entrypoint
            entrypoints[method_name] = function_v1_schema(receive_schema);
        }

        // add all receive entrypoints
        schema_json["entrypoints"] = entrypoints;
    }

    write_schema(path_of_out, contract_name, contract_counter, schema_json)
}

/// Converts the ContractV2 schema of the given contract_name to JSON and writes
/// it to a file named after the smart contract name at the specified location.
pub fn write_json_schema_to_file_v2(
    path_of_out: &Path,
    contract_name: &str,
    contract_counter: usize,
    contract_schema: &ContractV2,
) -> anyhow::Result<()> {
    // create empty schema_json
    let mut schema_json: Value = Value::Object(serde_json::Map::new());

    // add init schema
    if let Some(init_schema) = &contract_schema.init {
        schema_json["init"] = function_v2_schema(init_schema);
    }

    // add receive entrypoints
    if !contract_schema.receive.is_empty() {
        // create empty entrypoints
        let mut entrypoints: Value = Value::Object(serde_json::Map::new());

        // iterate through the entrypoints and add their schemas
        for (method_name, receive_schema) in contract_schema.receive.iter() {
            // add `method_name` entrypoint
            entrypoints[method_name] = function_v2_schema(receive_schema)
        }

        // add all receive entrypoints
        schema_json["entrypoints"] = entrypoints;
    }

    write_schema(path_of_out, contract_name, contract_counter, schema_json)
}

/// Converts the ContractV3 schema of the given contract_name to JSON and writes
/// it to a file named after the smart contract name at the specified location.
pub fn write_json_schema_to_file_v3(
    path_of_out: &Path,
    contract_name: &str,
    contract_counter: usize,
    contract_schema: &ContractV3,
) -> anyhow::Result<()> {
    // create empty schema_json
    let mut schema_json: Value = Value::Object(serde_json::Map::new());

    // add init schema
    if let Some(init_schema) = &contract_schema.init {
        schema_json["init"] = function_v2_schema(init_schema)
    }

    // add event schema
    if let Some(event_schema) = &contract_schema.event {
        schema_json["event"] = type_to_json(event_schema);
    }

    // add receive entrypoints
    if !contract_schema.receive.is_empty() {
        // create empty entrypoints
        let mut entrypoints: Value = Value::Object(serde_json::Map::new());

        // iterate through the entrypoints and add their schemas
        for (method_name, receive_schema) in contract_schema.receive.iter() {
            // add `method_name` entrypoint
            entrypoints[method_name] = function_v2_schema(receive_schema)
        }

        // add all receive entrypoints
        schema_json["entrypoints"] = entrypoints;
    }

    write_schema(path_of_out, contract_name, contract_counter, schema_json)
}

// -------------------- Export Functions -------------------- //

/// Write the JSON representation of the schema into files in the `out`
/// directory. The files are named after contract_names, except if a
/// contract_name contains unsuitable characters. Then the counter is used to
/// name the file.
pub(crate) fn write_json_schema(out: &Path, schema: &VersionedModuleSchema) -> anyhow::Result<()> {
    match schema {
        VersionedModuleSchema::V0(module_schema) => {
            for (contract_counter, (contract_name, contract_schema)) in
                module_schema.contracts.iter().enumerate()
            {
                write_json_schema_to_file_v0(out, contract_name, contract_counter, contract_schema)?
            }
        }
        VersionedModuleSchema::V1(module_schema) => {
            for (contract_counter, (contract_name, contract_schema)) in
                module_schema.contracts.iter().enumerate()
            {
                write_json_schema_to_file_v1(out, contract_name, contract_counter, contract_schema)?
            }
        }
        VersionedModuleSchema::V2(module_schema) => {
            for (contract_counter, (contract_name, contract_schema)) in
                module_schema.contracts.iter().enumerate()
            {
                write_json_schema_to_file_v2(out, contract_name, contract_counter, contract_schema)?
            }
        }
        VersionedModuleSchema::V3(module_schema) => {
            for (contract_counter, (contract_name, contract_schema)) in
                module_schema.contracts.iter().enumerate()
            {
                write_json_schema_to_file_v3(out, contract_name, contract_counter, contract_schema)?
            }
        }
    }
    Ok(())
}
