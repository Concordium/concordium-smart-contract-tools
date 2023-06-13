# Developer Front End Tools

The front end contains useful tools for developers:

- Upload and deploy a smart contract module to chain.
- Initialize a smart contract module on chain.

Only the browser wallet (no walletConnect) is supported in the first version.

## Prerequisites

-   Browser wallet extension must be installed in Chrome browser and the Concordium testnet needs to be selected.

## Running the front end

Clone the repo:

```shell
git clone git@github.com:Concordium/concordium-smart-contract-tools.git
```

Navigate into this folder:
```shell
cd ./front-end-tools
```

-   Run `yarn install` in this folder.

To start the front end locally, do the following:

-   Run `yarn build` in this folder.
-   Run `yarn start` in this folder.
-   Open URL logged in console (typically http://127.0.0.1:8080).

To have hot-reload (useful for development), do the following instead:

-   Run `yarn watch` in this folder in a terminal.
-   Run `yarn start` in this folder in another terminal.
-   Open URL logged in console (typically http://127.0.0.1:8080).

## Using yarn (on Unix/macOS systems)

Some of the node modules have Windows-type line endings (\r\n), instead of Unix line endings (\n), which causes problems when using an old yarn package manager.

If you see an error message similar to this when executing `yarn start`, then you've run into the problem:
```shell
env: node\r: No such file or directory
```

Use `npm install` instead of `yarn install` in the above command or use an up-to-date `yarn` version (non-classic `yarn` version). `npm` (newer non-classic `yarn` versions) will correct the line ending.

Additional information can be found [here](https://techtalkbook.com/env-noder-no-such-file-or-directory/).

## Build and run the Docker image

To build the docker image run the following command **from the root of the repository**:

```
docker build -f front-end-tools/Dockerfile -t front-end-tools:$PROJECT_VERSION .
```

e.g.

```
docker build -f front-end-tools/Dockerfile -t front-end-tools:3.0.0 .
```

To run the docker image run the following command:

```
docker run -it -d -p 8080:80 --name web front-end-tools:$PROJECT_VERSION
```

e.g.

```
docker run -it -d -p 8080:80 --name web front-end-tools:3.0.0
```

Open http://127.0.0.1:8080 in your browser.

