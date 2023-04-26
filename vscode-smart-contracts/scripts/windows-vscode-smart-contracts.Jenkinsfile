pipeline {
    agent { label 'jenkins-worker' }
    environment {
        VERSION = sh(
            returnStdout: true,
            script: '''\
                # Extract version number if not set as parameter
                [ -z "$VERSION" ] && VERSION=$(node -p "require('vscode-smart-contracts/package.json').version")
                echo -n "$VERSION"
            '''.stripIndent()
        )
        CARGO_CONCORDIUM_VERSION = sh(
            returnStdout: true,
            script: '''\
                # Extract version number if not set as parameter
                [ -z "$VERSION" ] && VERSION=$(awk '/version = / { print substr($3, 2, length($3)-2); exit }' cargo-concordium/Cargo.toml)
                echo -n "$VERSION"
            '''.stripIndent()
        )
        CARGO_CONCORDIUM_EXECUTABLE = "s3://distribution.concordium.software/tools/windows/signed/cargo-concordium_${CARGO_CONCORDIUM_VERSION}.exe"
        OUTFILE = "s3://distribution.concordium.software/tools/windows/vscode-smart-contracts_${VERSION}.vsix"
    }
    stages {
        stage('precheck') {
            steps {
                sh '''\
                    # Fail if file already exists
                    totalFoundObjects=$(aws s3 ls "$OUTFILE" --summarize | grep "Total Objects: " | sed "s/[^0-9]*//g")
                    if [ "$totalFoundObjects" -ne "0" ]; then
                        echo "$OUTFILE already exists"
                        false
                    fi
                '''.stripIndent()
            }
        }
        stage('build') {
            agent {
                docker {
                    reuseNode true
                    image 'node:16-alpine'
                    args '-u root'
                }
            }
            steps {
                sh '''\
                    cd vscode-smart-contracts

                    # Download cargo-concordium executable from S3.
                    aws s3 cp "${CARGO_CONCORDIUM_EXECUTABLE}" ./executables/cargo-concordium.exe

                    # Prepare output directory.
                    mkdir ../out

                    # Build the extension
                    npx vsce package --target win32-x64 --out ../out/extension.vsix
                '''.stripIndent()
                stash includes: 'out/extension.vsix', name: 'release'
            }
            post {
                cleanup {
                    sh '''\
                        # Docker image has to run as root, otherwise user dosen't have access to node
                        # this means all generated files a owned by root, in workdir mounted from host
                        # meaning jenkins can't clean the files, so set owner of all files to jenkins
                        chown -R 1000:1000 .
                    '''.stripIndent()
                }
            }
        }
        stage('Publish') {
            steps {
                unstash 'release'
                sh '''\
                    # Push to s3
                    aws s3 cp "out/extension.vsix" "${OUTFILE}" --grants read=uri=http://acs.amazonaws.com/groups/global/AllUsers
                '''.stripIndent()
            }
        }
    }
}
