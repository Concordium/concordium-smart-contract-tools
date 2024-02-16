import React, { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import Select from 'react-select';
import { Alert, Button, Form, Row } from 'react-bootstrap';

import { WalletConnection } from '@concordium/react-components';
import {
    ModuleReference,
    TransactionKindString,
    TransactionSummaryType,
    displayTypeSchemaTemplate,
    toBuffer,
    ConcordiumGRPCClient,
    getInitContractParameterSchema,
    TransactionHash,
    ContractName,
    AccountAddress,
    Energy,
    CcdAmount,
} from '@concordium/web-sdk';

import { TxHashLink } from './CCDScanLinks';
import Box from './Box';
import { initialize } from '../writing_to_blockchain';
import { getObjectExample, getArrayExample } from '../utils';
import {
    REFRESH_INTERVAL,
    INPUT_PARAMETER_TYPES_OPTIONS,
    REG_MODULE_REF,
    MODULE_REFERENCE_PLACEHOLDER,
    OPTIONS_DERIVE_FROM_MODULE_REFERENCE,
    DO_NOT_DERIVE,
    DERIVE_FROM_STEP_1,
    DERIVE_FROM_CHAIN,
    INPUT_PARAMETER_TYPE_ARRAY,
    INPUT_PARAMETER_TYPE_OBJECT,
    INPUT_PARAMETER_TYPE_STRING,
    INPUT_PARAMETER_TYPE_NUMBER,
} from '../constants';
import { getModuleSource } from '../reading_from_blockchain';

interface ConnectionProps {
    account: string;
    client: ConcordiumGRPCClient | undefined;
    connection: WalletConnection;
    isTestnet: boolean;
    moduleReferenceCalculated: undefined | ModuleReference.Type;
}

/**
 * A component that manages the input fields and corresponding state to initialize a new smart contract instance on chain.
 * This components creates an `InitContract` transaction.
 */
export default function InitComponent(props: ConnectionProps) {
    const { account, client, connection, isTestnet, moduleReferenceCalculated } = props;

    type FormType = {
        cCDAmount: number;
        deriveFromModuleReference: string | undefined;
        file: FileList | undefined;
        hasInputParameter: boolean;
        inputParameter: string | undefined;
        inputParameterType: string | undefined;
        isPayable: boolean;
        maxExecutionEnergy: number;
        moduleReferenceString: string | undefined;
        smartContractName: string | undefined;
    };

    const form = useForm<FormType>({ mode: 'all' });

    const [deriveFromModuleReference, hasInputParameter, inputParameterType, isPayable, smartContractName, file] =
        useWatch({
            control: form.control,
            name: [
                'deriveFromModuleReference',
                'hasInputParameter',
                'inputParameterType',
                'isPayable',
                'smartContractName',
                'file',
            ],
        });

    const [transactionError, setTransactionError] = useState<string | undefined>(undefined);

    const [uploadError2, setUploadError2] = useState<string | undefined>(undefined);
    const [parsingError, setParsingError] = useState<string | undefined>(undefined);
    const [smartContractIndexError, setSmartContractIndexError] = useState<string | undefined>(undefined);
    const [isModuleReferenceAlreadyDeployedError, setIsModuleReferenceAlreadyDeployedError] = useState<
        string | undefined
    >(undefined);
    const [moduleReferenceError, setModuleReferenceError] = useState<string | undefined>(undefined);
    const [moduleReferenceLengthError, setModuleReferenceLengthError] = useState<string | undefined>(undefined);
    const [schemaError, setSchemaError] = useState<string | undefined>(undefined);

    const [isModuleReferenceAlreadyDeployed, setIsModuleReferenceAlreadyDeployed] = useState(false);

    const [txHash, setTxHash] = useState<string | undefined>(undefined);

    const [schema, setSchema] = useState<string | undefined>(undefined);
    const [moduleReference, setModuleReference] = useState<ModuleReference.Type | undefined>(
        ModuleReference.fromHexString(MODULE_REFERENCE_PLACEHOLDER)
    );

    const [smartContractIndex, setSmartContractIndex] = useState<string | undefined>(undefined);
    const [inputParameterTemplate, setInputParameterTemplate] = useState<string | undefined>(undefined);
    const [displayContracts, setDisplayContracts] = useState<string[]>([]);

    // Refresh smartContractIndex periodically.
    // eslint-disable-next-line consistent-return
    useEffect(() => {
        if (connection && client && txHash !== undefined) {
            const interval = setInterval(() => {
                client
                    .getBlockItemStatus(TransactionHash.fromHexString(txHash))
                    .then((report) => {
                        if (report !== undefined) {
                            setSmartContractIndex(undefined);
                            if (report.status === 'finalized') {
                                if (
                                    report.outcome.summary.type === TransactionSummaryType.AccountTransaction &&
                                    report.outcome.summary.transactionType === TransactionKindString.InitContract
                                ) {
                                    setSmartContractIndex(
                                        report.outcome.summary.contractInitialized.address.index.toString()
                                    );
                                    clearInterval(interval);
                                } else {
                                    setSmartContractIndexError('Contract initialization failed');
                                    clearInterval(interval);
                                }
                            }
                        }
                    })
                    .catch((e) => {
                        setSmartContractIndex(undefined);
                        setSmartContractIndexError((e as Error).message);
                        clearInterval(interval);
                    });
            }, REFRESH_INTERVAL.asMilliseconds());
            return () => clearInterval(interval);
        }
    }, [connection, client, txHash]);

    useEffect(() => {
        setIsModuleReferenceAlreadyDeployedError(undefined);
        if (connection && client && moduleReference) {
            client
                .getModuleSource(moduleReference)
                .then((value) => {
                    setIsModuleReferenceAlreadyDeployed(value !== undefined);
                })
                .catch((e) => {
                    setIsModuleReferenceAlreadyDeployedError((e as Error).message.replaceAll('%20', ' '));
                    setIsModuleReferenceAlreadyDeployed(false);
                });
        }
    }, [connection, client, moduleReference]);

    const shouldWarnDifferenceModuleReferences = useMemo(() => {
        if (
            moduleReference !== undefined &&
            moduleReferenceCalculated !== undefined &&
            moduleReferenceCalculated.moduleRef !== moduleReference.moduleRef
        ) {
            return true;
        }
        return false;
    }, [moduleReference, moduleReferenceCalculated]);

    const shouldWarnInputParameterInSchemaIgnored = useMemo(() => {
        if (inputParameterTemplate !== undefined && hasInputParameter === false) {
            return true;
        }
        return false;
    }, [inputParameterTemplate, hasInputParameter]);

    const shouldWarnNoEmbeddedSchema = useMemo(() => schema?.length === 0, [schema]);

    useEffect(() => {
        setSchemaError(undefined);
        setInputParameterTemplate(undefined);

        let initTemplate;

        try {
            if (smartContractName === undefined) {
                throw new Error('Set smart contract name');
            }

            if (schema) {
                const inputParameterTypeSchemaBuffer = getInitContractParameterSchema(
                    toBuffer(schema, 'base64'),
                    ContractName.fromString(smartContractName),
                    2
                );

                initTemplate = displayTypeSchemaTemplate(inputParameterTypeSchemaBuffer);

                setInputParameterTemplate(initTemplate);
            }
        } catch (e) {
            if (deriveFromModuleReference === DO_NOT_DERIVE.value) {
                setSchemaError(
                    `Could not get schema from uploaded schema. Uncheck "Has Input Parameter" checkbox if this entrypoint has no input parameter. Original error: ${e}`
                );
            } else {
                setSchemaError(
                    `Could not get embedded schema from the module. Select "${DO_NOT_DERIVE.label}" to manually upload a schema or uncheck "Has Input Parameter" checkbox if this entrypoint has no input parameter. Original error: ${e}`
                );
            }
        }

        if (
            initTemplate &&
            (inputParameterType === INPUT_PARAMETER_TYPE_ARRAY.value ||
                inputParameterType === INPUT_PARAMETER_TYPE_OBJECT.value)
        ) {
            form.setValue('inputParameter', JSON.stringify(JSON.parse(initTemplate), undefined, 2));
        }
    }, [hasInputParameter, smartContractName, schema, inputParameterType]);

    const validateModuleReference = (value: string | undefined) => {
        if (!value) {
            return true;
        }

        if (REG_MODULE_REF.test(value)) {
            setModuleReference(ModuleReference.fromHexString(value));
        }

        return REG_MODULE_REF.test(value) ? true : 'Invalid module reference. Not a hex string of length 64.';
    };

    const deriveSchemaAndContractNames = async (moduleRef: ModuleReference.Type) => {
        const module = await getModuleSource(client, moduleRef);

        let wasmModule;
        try {
            wasmModule = await WebAssembly.compile(module.source);
        } catch (err) {
            setModuleReferenceError('ModuleSource on chain is disrupted');
        }

        if (wasmModule) {
            const moduleFunctions = WebAssembly.Module.exports(wasmModule);

            const contractNames = [];
            for (let i = 0; i < moduleFunctions.length; i += 1) {
                if (moduleFunctions[i].name.startsWith('init_')) {
                    contractNames.push(moduleFunctions[i].name.slice(5));
                }
            }

            setDisplayContracts(contractNames);
            // We select and display the first contract name in the drop-down as the default value.
            // This is especially convenient if the module only includes one contract since the user does not have to manually select
            // the contract name. A smart contract module can include several smart contracts on Concordium.
            form.setValue('smartContractName', contractNames[0]);

            const customSection = WebAssembly.Module.customSections(wasmModule, 'concordium-schema');

            const embeddedSchema = new Uint8Array(customSection[0]);

            // Use `reduce` to be able to convert large schema.
            const embeddedModuleSchemaBase64 = btoa(
                new Uint8Array(embeddedSchema).reduce((data, byte) => data + String.fromCharCode(byte), '')
            );
            setSchema(embeddedModuleSchemaBase64);
        }
    };

    function onSubmit(data: FormType) {
        setTxHash(undefined);
        setSmartContractIndexError(undefined);
        setSmartContractIndex(undefined);
        setTransactionError(undefined);

        // Send init transaction
        const tx = initialize(
            connection,
            AccountAddress.fromBase58(account),
            isModuleReferenceAlreadyDeployed,
            moduleReference,
            data.smartContractName ? ContractName.fromString(data.smartContractName) : undefined,
            data.hasInputParameter,
            data.inputParameter,
            data.inputParameterType,
            schema,
            data.deriveFromModuleReference,
            Energy.create(data.maxExecutionEnergy),
            CcdAmount.fromMicroCcd(data.cCDAmount ?? 0)
        );
        tx.then(setTxHash).catch((err: Error) => setTransactionError((err as Error).message));
    }

    return (
        <Box header="Step 2: Initialize Smart Contract">
            <Form onSubmit={form.handleSubmit(onSubmit)}>
                <Form.Group className="justify-content-center">
                    <Form.Label>DeriveFromModuleReference</Form.Label>
                    <Select
                        {...form.register('deriveFromModuleReference', { required: true })}
                        options={OPTIONS_DERIVE_FROM_MODULE_REFERENCE}
                        onChange={async (e) => {
                            form.setValue('deriveFromModuleReference', e?.value);

                            setModuleReferenceError(undefined);
                            setModuleReferenceLengthError(undefined);
                            setSchema(undefined);
                            form.setValue('smartContractName', undefined);
                            form.setValue('file', undefined);
                            setDisplayContracts([]);

                            const selectValue = form.getValues('deriveFromModuleReference');

                            if (selectValue === DERIVE_FROM_STEP_1.value) {
                                form.clearErrors('moduleReferenceString');
                                setModuleReference(undefined);
                                form.setValue('moduleReferenceString', undefined);

                                if (moduleReferenceCalculated === undefined) {
                                    setModuleReferenceError('No module is uploaded in step 1');
                                }

                                if (moduleReferenceCalculated !== undefined) {
                                    setModuleReference(moduleReferenceCalculated);
                                    form.setValue('moduleReferenceString', moduleReferenceCalculated.moduleRef);

                                    await deriveSchemaAndContractNames(moduleReferenceCalculated);
                                }
                            }

                            if (selectValue === DERIVE_FROM_CHAIN.value) {
                                if (moduleReference === undefined) {
                                    setModuleReferenceError('Set module reference field below');
                                } else {
                                    await deriveSchemaAndContractNames(moduleReference);
                                }
                            }
                        }}
                    />
                    {deriveFromModuleReference === DERIVE_FROM_STEP_1.value && (
                        <>
                            <br />
                            <Alert variant="info">
                                <div>
                                    You autofilled the <code>module reference</code>, the{' '}
                                    <code>smart contract name</code>, and the <code>input parameter schema</code> from
                                    the module in step1.
                                </div>
                            </Alert>
                            <Alert variant="info" style={{ textAlign: 'left' }}>
                                <li>
                                    Select <b>{DO_NOT_DERIVE.label}</b> in the above drop down, if you want to manually
                                    fill in a <code>module reference</code>, the <code>smart contract name</code>, or an{' '}
                                    <code>input parameter schema</code>.
                                </li>
                                <li>
                                    Select <b>{DERIVE_FROM_STEP_1.label}</b> again in the drop down, if you want to load
                                    a new module from <b>Step 1</b> because this box will not automatically update when
                                    you do changes to <b>Step 1</b>.
                                </li>
                            </Alert>
                            <br />
                        </>
                    )}
                    {deriveFromModuleReference === DERIVE_FROM_CHAIN.value && (
                        <>
                            <br />
                            <Alert variant="info">
                                <div>
                                    You autofilled the <code>smart contract name</code>, and the{' '}
                                    <code>input parameter schema</code> from a module refence already on chain.
                                </div>
                            </Alert>
                            <Alert variant="info" style={{ textAlign: 'left' }}>
                                <ul>
                                    <li>
                                        Select <b>{DO_NOT_DERIVE.label}</b> in the above drop down, if you want to
                                        manually fill in the <code>smart contract name</code>, or an{' '}
                                        <code>input parameter schema</code>.
                                    </li>
                                    <li>
                                        Select <b>{DERIVE_FROM_CHAIN.label}</b> again in the drop down, if you want to
                                        load a new module from the chain because this box will not automatically update
                                        when you change the moduel reference in field below.
                                    </li>
                                </ul>
                            </Alert>
                            <br />
                        </>
                    )}
                </Form.Group>

                {moduleReferenceError && <Alert variant="danger"> Error: {moduleReferenceError}. </Alert>}
                <br />
                <Row>
                    <Form.Group className="col-md-4 mb-3">
                        <Form.Label> Module Reference</Form.Label>
                        <Form.Control
                            defaultValue={MODULE_REFERENCE_PLACEHOLDER}
                            disabled={deriveFromModuleReference === DERIVE_FROM_STEP_1.value}
                            {...form.register('moduleReferenceString', {
                                required: true,
                                validate: validateModuleReference,
                            })}
                        />
                        {form.formState.errors.moduleReferenceString && (
                            <Alert variant="danger">
                                {' '}
                                Module reference is required. {form.formState.errors.moduleReferenceString.message}
                            </Alert>
                        )}
                        <Form.Text />
                    </Form.Group>

                    {deriveFromModuleReference !== DO_NOT_DERIVE.value && displayContracts.length > 0 ? (
                        <Form.Group className="col-md-4 mb-3">
                            <Form.Label>Smart Contract Name</Form.Label>

                            <Select
                                {...form.register('smartContractName', { required: true })}
                                options={displayContracts?.map((contract) => ({
                                    value: contract,
                                    label: contract,
                                }))}
                                placeholder={displayContracts[0]}
                                onChange={(e) => {
                                    form.setValue('smartContractName', e?.value);
                                }}
                            />
                            {form.formState.errors.smartContractName && (
                                <Alert variant="info"> Smart contract name is required </Alert>
                            )}
                            <Form.Text />
                        </Form.Group>
                    ) : (
                        <Form.Group className="col-md-4 mb-3">
                            <Form.Label>Smart Contract Name</Form.Label>
                            <Form.Control
                                defaultValue="myContractName"
                                {...form.register('smartContractName', { required: true })}
                            />
                            {form.formState.errors.smartContractName && (
                                <Alert variant="info"> Smart contract name is required </Alert>
                            )}
                            <Form.Text />
                        </Form.Group>
                    )}

                    <Form.Group className="col-md-4 mb-3">
                        <Form.Label>Max Execution Energy</Form.Label>
                        <Form.Control
                            defaultValue={30000}
                            type="number"
                            min="0"
                            {...form.register('maxExecutionEnergy', { required: true })}
                        />
                        <Form.Text />
                        {form.formState.errors.maxExecutionEnergy && (
                            <Alert variant="info"> Max executiong energy is required </Alert>
                        )}
                    </Form.Group>
                </Row>

                {moduleReferenceLengthError && <Alert variant="danger"> Error: {moduleReferenceLengthError}. </Alert>}

                <Form.Group className="mb-3 d-flex justify-content-center">
                    <Form.Check
                        type="checkbox"
                        label="Is Payable"
                        {...form.register('isPayable')}
                        onChange={async (e) => {
                            const isPayableRegister = form.register('isPayable');

                            isPayableRegister.onChange(e);

                            form.setValue('cCDAmount', 0);
                        }}
                    />
                </Form.Group>

                {isPayable && (
                    <>
                        <div className="box">
                            <Form.Group className="mb-3">
                                <Form.Label>CCD amount (micro):</Form.Label>
                                <Form.Control
                                    defaultValue={0}
                                    type="number"
                                    min="0"
                                    {...form.register('cCDAmount', { required: true })}
                                />
                                <Form.Text />
                                {form.formState.errors.cCDAmount && (
                                    <Alert variant="info"> cCDAmount is required </Alert>
                                )}
                            </Form.Group>
                        </div>
                        <br />
                    </>
                )}

                <Form.Group className="mb-3 d-flex justify-content-center">
                    <Form.Check
                        type="checkbox"
                        label="Has Input Parameter"
                        {...form.register('hasInputParameter')}
                        onChange={async (e) => {
                            const hasInputParameterRegister = form.register('hasInputParameter');

                            setParsingError(undefined);
                            form.setValue('inputParameterType', undefined);
                            form.setValue('inputParameter', undefined);
                            setInputParameterTemplate(undefined);
                            // If previously a file was uploaded and the schema was derived from it. Delete the schema.
                            if (file !== undefined) {
                                setSchema(undefined);
                                form.setValue('file', undefined);
                            }
                            setSchemaError(undefined);

                            hasInputParameterRegister.onChange(e);
                        }}
                    />
                </Form.Group>

                {hasInputParameter && (
                    <div className="box">
                        {deriveFromModuleReference === DO_NOT_DERIVE.value && (
                            <Form.Group className="mb-3">
                                <Form.Label>Upload Smart Contract Module Schema File (e.g. schema.bin)</Form.Label>
                                <Form.Control
                                    type="file"
                                    accept=".bin"
                                    {...form.register('file')}
                                    onChange={async (e) => {
                                        const fileRegister = form.register('file');

                                        fileRegister.onChange(e);

                                        setUploadError2(undefined);
                                        setSchema(undefined);

                                        const files = form.getValues('file');

                                        if (files !== undefined && files !== null && files.length > 0) {
                                            const file0 = files[0];
                                            const arrayBuffer = await file0.arrayBuffer();

                                            // Use `reduce` to be able to convert large schemas.
                                            const embeddedSchema = btoa(
                                                new Uint8Array(arrayBuffer).reduce(
                                                    (data, byte) => data + String.fromCharCode(byte),
                                                    ''
                                                )
                                            );
                                            setSchema(embeddedSchema);
                                        } else {
                                            setUploadError2('Upload schema file is undefined');
                                        }
                                    }}
                                />
                                <Form.Text />
                            </Form.Group>
                        )}
                        {deriveFromModuleReference === DO_NOT_DERIVE.value && schema && (
                            <div className="actionResultBox">
                                Schema in base64:
                                <div>{schema.toString().slice(0, 30)} ...</div>
                            </div>
                        )}
                        {uploadError2 !== undefined && <Alert variant="danger"> Error: {uploadError2}. </Alert>}
                        {schemaError !== undefined && <Alert variant="danger"> Error: {schemaError}. </Alert>}
                        {inputParameterTemplate && (
                            <>
                                <br />
                                <br />
                                <div className="actionResultBox">
                                    Parameter Template:
                                    <pre>{JSON.stringify(JSON.parse(inputParameterTemplate), undefined, 2)}</pre>
                                </div>
                            </>
                        )}
                        <br />
                        <Form.Group className="mb-3">
                            <Form.Label>Select input parameter type:</Form.Label>
                            <Select
                                options={INPUT_PARAMETER_TYPES_OPTIONS}
                                {...form.register('inputParameterType')}
                                onChange={(e) => {
                                    form.setValue('inputParameterType', e?.value);
                                    form.setValue('inputParameter', undefined);

                                    setParsingError(undefined);
                                }}
                            />
                            <Form.Text />
                        </Form.Group>

                        {(inputParameterType === INPUT_PARAMETER_TYPE_NUMBER.value ||
                            inputParameterType === INPUT_PARAMETER_TYPE_STRING.value) && (
                            <Form.Group className="mb-3">
                                <Form.Label> Add your input parameter ({inputParameterType}):</Form.Label>
                                <Form.Control
                                    placeholder={
                                        inputParameterType === INPUT_PARAMETER_TYPE_STRING.value
                                            ? 'myString'
                                            : '1000000'
                                    }
                                    {...form.register('inputParameter', { required: true })}
                                    onChange={(e) => {
                                        const register = form.register('inputParameter', {
                                            required: true,
                                        });

                                        register.onChange(e);

                                        setParsingError(undefined);
                                    }}
                                />
                                {form.formState.errors.inputParameter && (
                                    <Alert variant="info"> Input parameter is required </Alert>
                                )}
                                <Form.Text />
                            </Form.Group>
                        )}

                        {(inputParameterType === INPUT_PARAMETER_TYPE_ARRAY.value ||
                            inputParameterType === INPUT_PARAMETER_TYPE_OBJECT.value) && (
                            <Form.Group className="mb-3">
                                <Form.Label> Add your input parameter ({inputParameterType}):</Form.Label>

                                {inputParameterType === INPUT_PARAMETER_TYPE_ARRAY.value && (
                                    <textarea
                                        {...form.register('inputParameter')}
                                        onChange={(event) => {
                                            setParsingError(undefined);
                                            const target = event.target as HTMLTextAreaElement;

                                            try {
                                                JSON.parse(target.value);
                                            } catch (e) {
                                                setParsingError((e as Error).message);
                                                return;
                                            }
                                            form.setValue('inputParameter', target.value);
                                        }}
                                    >
                                        {getArrayExample(inputParameterTemplate)}
                                    </textarea>
                                )}
                                {inputParameterType === INPUT_PARAMETER_TYPE_OBJECT.value && (
                                    <textarea
                                        {...form.register('inputParameter')}
                                        onChange={(event) => {
                                            setParsingError(undefined);
                                            const target = event.target as HTMLTextAreaElement;

                                            try {
                                                JSON.parse(target.value);
                                            } catch (e) {
                                                setParsingError((e as Error).message);
                                                return;
                                            }
                                            form.setValue('inputParameter', target.value);
                                        }}
                                    >
                                        {getObjectExample(inputParameterTemplate)}
                                    </textarea>
                                )}

                                {form.formState.errors.inputParameter && (
                                    <Alert variant="info"> Input parameter is required </Alert>
                                )}
                                <Form.Text />
                            </Form.Group>
                        )}

                        {parsingError !== undefined && <Alert variant="danger"> Error: {parsingError}. </Alert>}
                    </div>
                )}
                <br />
                <Button variant="primary" type="submit">
                    Initialize Smart Contract
                </Button>
                <br />
                <br />
                {!isModuleReferenceAlreadyDeployed && (
                    <Alert variant="warning">Warning: Module reference does not exist on chain.</Alert>
                )}
                {shouldWarnDifferenceModuleReferences && (
                    <Alert variant="warning">Warning: Module references in step 1 and step 2 are different.</Alert>
                )}
                {shouldWarnNoEmbeddedSchema && (
                    <Alert variant="warning">
                        Warning: No schema was embedded in the module deployed on chain. It is unknown if contract
                        expects an input parameter. No parameter schemas will be displayed
                    </Alert>
                )}
                {shouldWarnInputParameterInSchemaIgnored && (
                    <Alert variant="warning">
                        {' '}
                        Warning: Input parameter schema found but &quot;Has Input Parameter&quot; checkbox is unchecked.
                    </Alert>
                )}
                {!txHash && transactionError && <Alert variant="danger">Error: {transactionError}.</Alert>}
                {txHash && (
                    <TxHashLink
                        txHash={txHash}
                        isTestnet={isTestnet}
                        message="The smart contract index will appear below once the transaction is finalized."
                    />
                )}
                <br />
                {smartContractIndexError !== undefined && (
                    <Alert variant="danger"> Error: {smartContractIndexError}.</Alert>
                )}
                {isModuleReferenceAlreadyDeployedError !== undefined && (
                    <Alert variant="danger"> Error: {isModuleReferenceAlreadyDeployedError}.</Alert>
                )}
                {smartContractIndex !== undefined && (
                    <div className="actionResultBox">
                        Smart Contract Inedex:
                        <div>{smartContractIndex}</div>
                    </div>
                )}
            </Form>
        </Box>
    );
}
