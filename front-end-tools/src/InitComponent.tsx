/* eslint-disable no-console */
import React, { useEffect, useState, PropsWithChildren } from 'react';
import { useForm } from 'react-hook-form';
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
} from '@concordium/web-sdk';

import { initialize } from './writing_to_blockchain';
import { getObjectExample, getArrayExample } from './utils';

import { REFRESH_INTERVAL, INPUT_PARAMETER_TYPES_OPTIONS } from './constants';

type BoxProps = PropsWithChildren<{
    header: string;
}>;

function Box({ header, children }: BoxProps) {
    return (
        <fieldset className="box">
            <legend>{header}</legend>
            <div className="boxFields">{children}</div>
            <br />
        </fieldset>
    );
}

interface ConnectionProps {
    isTestnet: boolean;
    account: string;
    connection: WalletConnection;
    client: ConcordiumGRPCClient | undefined;
    contracts: string[];
    embeddedModuleSchemaBase64Init: undefined | string;
    moduleReferenceCalculated: undefined | string;
    moduleReferenceDeployed: undefined | string;
}

interface FunctionState {
    initFunction: undefined | string;
    readFunction: undefined | string;
    writeFunction: undefined | string;
}

export default function InitComponenet(props: ConnectionProps) {
    const {
        isTestnet,
        account,
        connection,
        client,
        moduleReferenceCalculated,
        moduleReferenceDeployed,
        embeddedModuleSchemaBase64Init,
        contracts,
    } = props;

    const initForm = useForm<{
        moduleReference: string | undefined;
        smartContractName: string | undefined;
        file: FileList | undefined;
        useModuleReferenceFromStep1: boolean;
        inputParameterType: string | undefined;
        inputParameter: string | undefined;
        hasInputParameter: boolean;
        maxExecutionEnergy: number;
        isPayable: boolean;
        cCDAmount: number;
    }>();
    const useModuleReferenceFromStep1 = initForm.watch('useModuleReferenceFromStep1');
    const smartContractName = initForm.watch('smartContractName');
    const inputParameterType = initForm.watch('inputParameterType');
    const isPayable = initForm.watch('isPayable');
    const hasInputParameter = initForm.watch('hasInputParameter');

    const [transactionErrorInit, setTransactionErrorInit] = useState<string | undefined>(undefined);

    const [uploadError2, setUploadError2] = useState<string | undefined>(undefined);
    const [parsingErrorInit, setParsingErrorInit] = useState<string | undefined>(undefined);
    const [smartContractIndexError, setSmartContractIndexError] = useState<string | undefined>(undefined);
    const [moduleReferenceError, setModuleReferenceError] = useState<string | undefined>(undefined);
    const [moduleReferenceLengthError, setModuleReferenceLengthError] = useState<string | undefined>(undefined);
    const [schemaError, setSchemaError] = useState<FunctionState>({
        initFunction: undefined,
        readFunction: undefined,
        writeFunction: undefined,
    });

    const [isModuleReferenceAlreadyDeployedStep2, setIsModuleReferenceAlreadyDeployedStep2] = useState(false);
    const [shouldWarnDifferenceModuleReferences, setShouldWarnDifferenceModuleReferences] = useState(false);
    const [shouldWarnInputParameterInSchemaIgnored, setShouldWarnInputParameterInSchemaIgnored] = useState({
        initFunction: false,
        readFunction: false,
        writeFunction: false,
    });

    const [txHashInit, setTxHashInit] = useState<string | undefined>(undefined);

    const [moduleReference, setModuleReference] = useState<string | undefined>(
        '91225f9538ac2903466cc4ab07b6eb607a2cd349549f357dfdf4e6042dde0693'
    );
    const [uploadedModuleSchemaBase64Initialization, setUploadedModuleSchemaBase64Initialization] = useState<
        string | undefined
    >(undefined);

    const [smartContractIndex, setSmartContractIndex] = useState<string | undefined>(undefined);
    const [inputParameterTemplate, setInputParameterTemplate] = useState<string | undefined>(undefined);
    const [displayContracts, setDisplayContracts] = useState<string[]>([]);

    // Refresh smartContractIndex periodically.
    // eslint-disable-next-line consistent-return
    useEffect(() => {
        if (connection && client && account && txHashInit !== undefined) {
            const interval = setInterval(() => {
                console.log('refreshing_smartContractIndex');
                client
                    .getBlockItemStatus(txHashInit)
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
        }
    }, [connection, account, client, txHashInit]);

    useEffect(() => {
        if (connection && client && account && moduleReference) {
            client
                .getModuleSource(new ModuleReference(moduleReference))
                .then((value) => {
                    if (value === undefined) {
                        setIsModuleReferenceAlreadyDeployedStep2(false);
                    } else {
                        setIsModuleReferenceAlreadyDeployedStep2(true);
                    }
                })
                .catch(() => {
                    setIsModuleReferenceAlreadyDeployedStep2(false);
                });
        }
    }, [connection, account, client, moduleReference]);

    useEffect(() => {
        if (
            moduleReference !== undefined &&
            moduleReferenceCalculated !== undefined &&
            moduleReferenceCalculated !== moduleReference
        ) {
            setShouldWarnDifferenceModuleReferences(true);
        } else {
            setShouldWarnDifferenceModuleReferences(false);
        }
    }, [moduleReference, moduleReferenceCalculated]);

    useEffect(() => {
        if (inputParameterTemplate !== undefined && hasInputParameter === false) {
            setShouldWarnInputParameterInSchemaIgnored({
                ...shouldWarnInputParameterInSchemaIgnored,
                initFunction: true,
            });
        } else {
            setShouldWarnInputParameterInSchemaIgnored({
                ...shouldWarnInputParameterInSchemaIgnored,
                initFunction: false,
            });
        }
    }, [inputParameterTemplate, hasInputParameter]);

    useEffect(() => {
        setSchemaError({ ...schemaError, initFunction: undefined });
        setInputParameterTemplate(undefined);

        let initTemplate;

        try {
            if (smartContractName === undefined) {
                throw new Error('Set smart contract name');
            }

            let schema = '';

            const schemaFromModule = useModuleReferenceFromStep1
                ? embeddedModuleSchemaBase64Init
                : uploadedModuleSchemaBase64Initialization;

            if (schemaFromModule !== undefined) {
                schema = schemaFromModule;
            }

            const inputParamterTypeSchemaBuffer = getInitContractParameterSchema(
                toBuffer(schema, 'base64'),
                smartContractName,
                2
            );

            initTemplate = displayTypeSchemaTemplate(inputParamterTypeSchemaBuffer);

            setInputParameterTemplate(initTemplate);
        } catch (e) {
            if (useModuleReferenceFromStep1) {
                setSchemaError({
                    ...schemaError,
                    initFunction: `Could not get embedded schema from the uploaded module. Uncheck "Use Module from Step 1" checkbox to manually upload a schema or uncheck "Has Input Paramter" checkbox if this entrypoint has no input parameter.  Original error: ${e}`,
                });
            } else {
                setSchemaError({
                    ...schemaError,
                    initFunction: `Could not get schema from uploaded schema. Uncheck "Has Input Paramter" checkbox if this entrypoint has no input parameter. Original error: ${e}`,
                });
            }
        }

        if (initTemplate) {
            if (inputParameterType === 'array') {
                initForm.setValue('inputParameter', JSON.stringify(JSON.parse(initTemplate), undefined, 2));
            } else if (inputParameterType === 'object') {
                initForm.setValue('inputParameter', JSON.stringify(JSON.parse(initTemplate), undefined, 2));
            }
        }
    }, [
        hasInputParameter,
        useModuleReferenceFromStep1,
        smartContractName,
        uploadedModuleSchemaBase64Initialization,
        inputParameterType,
    ]);

    return (
        <Box header="Step 2: Initialize Smart Contract">
            <Form>
                <Form.Group className="mb-3 d-flex justify-content-center">
                    <Form.Check
                        type="checkbox"
                        id="useModuleReferenceFromStep1"
                        label="Use Module From Step 1"
                        {...initForm.register('useModuleReferenceFromStep1')}
                        onChange={async (e) => {
                            const register = initForm.register('useModuleReferenceFromStep1');

                            register.onChange(e);

                            setModuleReferenceError(undefined);
                            setModuleReference(undefined);
                            setUploadedModuleSchemaBase64Initialization(undefined);

                            const checkboxElement = initForm.getValues('useModuleReferenceFromStep1');

                            initForm.setValue(
                                'moduleReference',
                                '00000000000000000000000000000000000000000000000000000000000000000'
                            );

                            if (
                                checkboxElement &&
                                moduleReferenceDeployed === undefined &&
                                moduleReferenceCalculated === undefined
                            ) {
                                setModuleReferenceError('Module reference is not set in step 1');
                            }

                            const newModuleReference =
                                moduleReferenceDeployed !== undefined
                                    ? moduleReferenceDeployed
                                    : moduleReferenceCalculated;

                            if (checkboxElement && newModuleReference !== undefined) {
                                initForm.setValue('moduleReference', newModuleReference);

                                setDisplayContracts(contracts);
                            }
                        }}
                    />
                </Form.Group>

                {useModuleReferenceFromStep1 && (
                    <>
                        <br />
                        <Alert variant="info">
                            <div>
                                This checkbox autofilled the <code>module reference</code>, the{' '}
                                <code>smart contract name</code>, and the <code>input parameter schema</code> from the
                                module in step1.
                            </div>
                            <br />
                            <div>
                                <b>Uncheck</b> this box, if you want to manually fill in a <code>module reference</code>
                                , the <code>smart contract name</code>, or an <code>input parameter schema</code>.
                            </div>
                            <br />
                            <div>
                                <b>Uncheck</b> and <b>check</b> this box again, if you want to load a new module from
                                step 1.
                            </div>
                        </Alert>
                        <br />
                    </>
                )}

                {moduleReferenceError && <Alert variant="danger"> Error: {moduleReferenceError}. </Alert>}

                <Row>
                    <Form.Group className="col-md-4 mb-3">
                        <Form.Label> Module Reference</Form.Label>
                        <Form.Control
                            defaultValue="91225f9538ac2903466cc4ab07b6eb607a2cd349549f357dfdf4e6042dde0693"
                            disabled={!!useModuleReferenceFromStep1}
                            {...initForm.register('moduleReference', { required: true })}
                            onChange={(e) => {
                                const register = initForm.register('moduleReference', {
                                    required: true,
                                });

                                register.onChange(e);

                                setModuleReferenceLengthError(undefined);

                                const moduleRef = initForm.getValues('moduleReference');

                                if (moduleRef !== undefined && moduleRef.length !== 64) {
                                    setModuleReferenceLengthError('Module reference has to be of length 64');
                                }
                            }}
                        />
                        <Form.Text />
                        {initForm.formState.errors.moduleReference && (
                            <Alert variant="info">Module reference is required </Alert>
                        )}
                    </Form.Group>

                    {useModuleReferenceFromStep1 && displayContracts.length > 0 ? (
                        <Form.Group className="col-md-4 mb-3">
                            <Form.Label>Smart Contract Name</Form.Label>

                            <Select
                                options={displayContracts?.map((contract) => ({
                                    value: contract,
                                    label: contract,
                                }))}
                                onChange={(e) => {
                                    initForm.setValue('smartContractName', e?.value);
                                }}
                            />

                            {initForm.formState.errors.smartContractName && (
                                <Alert variant="info"> Smart contract name is required </Alert>
                            )}
                            <Form.Text />
                        </Form.Group>
                    ) : (
                        <Form.Group className="col-md-4 mb-3">
                            <Form.Label>Smart Contract Name</Form.Label>
                            <Form.Control
                                defaultValue="myContractName"
                                {...initForm.register('smartContractName', { required: true })}
                            />
                            {initForm.formState.errors.smartContractName && (
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
                            {...initForm.register('maxExecutionEnergy', { required: true })}
                        />
                        <Form.Text />
                        {initForm.formState.errors.maxExecutionEnergy && (
                            <Alert variant="info"> Max executiong energy is required </Alert>
                        )}
                    </Form.Group>
                </Row>

                {moduleReferenceLengthError && <Alert variant="danger"> Error: {moduleReferenceLengthError}. </Alert>}

                <Form.Group className="mb-3 d-flex justify-content-center">
                    <Form.Check
                        type="checkbox"
                        id="isPayable"
                        label="Is Payable"
                        {...initForm.register('isPayable')}
                        onChange={async (e) => {
                            const isPayableRegister = initForm.register('isPayable');

                            isPayableRegister.onChange(e);

                            initForm.setValue('cCDAmount', 0);
                        }}
                    />
                </Form.Group>

                {isPayable && (
                    <Form.Group className=" mb-3">
                        <Form.Label>CCD amount (micro):</Form.Label>
                        <Form.Control
                            defaultValue={0}
                            type="number"
                            min="0"
                            {...initForm.register('cCDAmount', { required: true })}
                        />
                        <Form.Text />
                        {initForm.formState.errors.cCDAmount && <Alert variant="info"> cCDAmount is required </Alert>}
                    </Form.Group>
                )}

                <Form.Group className="mb-3 d-flex justify-content-center">
                    <Form.Check
                        type="checkbox"
                        id="hasInputParameter"
                        label="Has Input Parameter"
                        {...initForm.register('hasInputParameter')}
                        onChange={async (e) => {
                            const hasInputParameterRegister = initForm.register('hasInputParameter');

                            hasInputParameterRegister.onChange(e);

                            setParsingErrorInit(undefined);
                            initForm.setValue('inputParameterType', undefined);
                            initForm.setValue('inputParameter', undefined);
                            setInputParameterTemplate(undefined);
                            setUploadedModuleSchemaBase64Initialization(undefined);
                            setSchemaError({
                                ...schemaError,
                                initFunction: undefined,
                            });
                        }}
                    />
                </Form.Group>

                {hasInputParameter && (
                    <div className="box">
                        {!useModuleReferenceFromStep1 && (
                            <Form.Group className="mb-3">
                                <Form.Label>Upload Smart Contract Module Schema File (e.g. schema.bin)</Form.Label>
                                <Form.Control
                                    type="file"
                                    accept=".bin"
                                    {...initForm.register('file')}
                                    onChange={async (e) => {
                                        const fileRegister = initForm.register('file');

                                        fileRegister.onChange(e);

                                        setUploadError2(undefined);
                                        setUploadedModuleSchemaBase64Initialization(undefined);

                                        const files = initForm.getValues('file');

                                        if (files !== undefined && files !== null && files.length > 0) {
                                            const file = files[0];
                                            const arrayBuffer = await file.arrayBuffer();

                                            const schema = btoa(
                                                new Uint8Array(arrayBuffer).reduce((data, byte) => {
                                                    return data + String.fromCharCode(byte);
                                                }, '')
                                            );
                                            setUploadedModuleSchemaBase64Initialization(schema);
                                        } else {
                                            setUploadError2('Upload schema file is undefined');
                                        }
                                    }}
                                />
                                <Form.Text />
                            </Form.Group>
                        )}
                        {!useModuleReferenceFromStep1 && uploadedModuleSchemaBase64Initialization && (
                            <div className="actionResultBox">
                                Schema in base64:
                                <div>{uploadedModuleSchemaBase64Initialization.toString().slice(0, 30)} ...</div>
                            </div>
                        )}
                        {uploadError2 !== undefined && <Alert variant="danger"> Error: {uploadError2}. </Alert>}
                        {schemaError.writeFunction !== undefined && (
                            <Alert variant="danger"> Error: {schemaError.writeFunction}. </Alert>
                        )}
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
                                {...initForm.register('inputParameterType')}
                                onChange={(e) => {
                                    initForm.setValue('inputParameterType', e?.value);
                                    initForm.setValue('inputParameter', undefined);

                                    setParsingErrorInit(undefined);
                                }}
                            />
                            <Form.Text />
                        </Form.Group>

                        {(inputParameterType === 'number' || inputParameterType === 'string') && (
                            <Form.Group className="mb-3">
                                <Form.Label> Add your input parameter ({inputParameterType}):</Form.Label>
                                <Form.Control
                                    placeholder={inputParameterType === 'string' ? 'myString' : '1000000'}
                                    {...initForm.register('inputParameter', { required: true })}
                                    onChange={(e) => {
                                        const register = initForm.register('inputParameter', {
                                            required: true,
                                        });

                                        register.onChange(e);

                                        setParsingErrorInit(undefined);
                                    }}
                                />
                                {initForm.formState.errors.inputParameter && (
                                    <Alert variant="info"> Input parameter is required </Alert>
                                )}
                                <Form.Text />
                            </Form.Group>
                        )}

                        {(inputParameterType === 'object' || inputParameterType === 'array') && (
                            <Form.Group className="mb-3">
                                <Form.Label> Add your input parameter ({inputParameterType}):</Form.Label>

                                {inputParameterType === 'array' && (
                                    <textarea
                                        {...initForm.register('inputParameter')}
                                        onChange={(event) => {
                                            setParsingErrorInit(undefined);
                                            const target = event.target as HTMLTextAreaElement;

                                            try {
                                                JSON.parse(target.value);
                                            } catch (e) {
                                                setParsingErrorInit((e as Error).message);
                                                return;
                                            }
                                            initForm.setValue('inputParameter', target.value);
                                        }}
                                    >
                                        {getArrayExample(inputParameterTemplate)}
                                    </textarea>
                                )}
                                {inputParameterType === 'object' && (
                                    <textarea
                                        {...initForm.register('inputParameter')}
                                        onChange={(event) => {
                                            setParsingErrorInit(undefined);
                                            const target = event.target as HTMLTextAreaElement;

                                            try {
                                                JSON.parse(target.value);
                                            } catch (e) {
                                                setParsingErrorInit((e as Error).message);
                                                return;
                                            }
                                            initForm.setValue('inputParameter', target.value);
                                        }}
                                    >
                                        {getObjectExample(inputParameterTemplate)}
                                    </textarea>
                                )}

                                {initForm.formState.errors.inputParameter && (
                                    <Alert variant="info"> Input parameter is required </Alert>
                                )}
                                <Form.Text />
                            </Form.Group>
                        )}

                        {parsingErrorInit !== undefined && <Alert variant="danger"> Error: {parsingErrorInit}. </Alert>}
                    </div>
                )}
                <br />

                <Button
                    variant="primary"
                    type="button"
                    onClick={initForm.handleSubmit((data) => {
                        setTxHashInit(undefined);
                        setSmartContractIndexError(undefined);
                        setSmartContractIndex(undefined);
                        setTransactionErrorInit(undefined);

                        const schema = data.useModuleReferenceFromStep1
                            ? embeddedModuleSchemaBase64Init
                            : uploadedModuleSchemaBase64Initialization;

                        const tx = initialize(
                            connection,
                            account,
                            isModuleReferenceAlreadyDeployedStep2,
                            data.moduleReference,
                            data.inputParameter,
                            data.smartContractName,
                            data.hasInputParameter,
                            data.useModuleReferenceFromStep1,
                            schema,
                            data.inputParameterType,
                            BigInt(data.maxExecutionEnergy),
                            data.cCDAmount ? BigInt(data.cCDAmount) : BigInt(0)
                        );
                        tx.then(setTxHashInit).catch((err: Error) => setTransactionErrorInit((err as Error).message));
                    })}
                >
                    Initialize Smart Contract
                </Button>
                <br />
                <br />
                {shouldWarnDifferenceModuleReferences && (
                    <Alert variant="warning">Warning: Module references in step 1 and step 2 are different.</Alert>
                )}
                {shouldWarnInputParameterInSchemaIgnored.initFunction && (
                    <Alert variant="warning">
                        {' '}
                        Warning: Input parameter schema found but &quot;Has Input Parameter&quot; checkbox is unchecked.
                    </Alert>
                )}
                {!txHashInit && transactionErrorInit && <Alert variant="danger">Error: {transactionErrorInit}.</Alert>}
                {txHashInit && (
                    <>
                        <div>
                            Transaction hash:{' '}
                            <a
                                className="link"
                                target="_blank"
                                rel="noreferrer"
                                href={`https://${
                                    isTestnet ? `testnet.` : ``
                                }ccdscan.io/?dcount=1&dentity=transaction&dhash=${txHashInit}`}
                            >
                                {txHashInit}
                            </a>
                        </div>
                        <br />
                        <div>
                            CCDScan will take a moment to pick up the above transaction, hence the above link will work
                            in a bit.
                        </div>
                        <div>The smart contract index will appear below once the transaction is finalized.</div>
                    </>
                )}
                <br />
                {smartContractIndexError !== undefined && (
                    <Alert variant="danger"> Error: {smartContractIndexError}.</Alert>
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
