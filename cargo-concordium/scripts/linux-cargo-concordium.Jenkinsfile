pipeline {
    agent { label 'jenkins-worker' }
    environment {
        VERSION = sh(
            returnStdout: true, 
            script: '''\
                # Extract version number if not set as parameter
                [ -z "$VERSION" ] && VERSION=$(awk '/version = / { print substr($3, 2, length($3)-2); exit }' cargo-concordium/Cargo.toml)
                echo -n "$VERSION"
            '''.stripIndent()
        )
        OUTFILE = "s3://distribution.concordium.software/tools/linux/cargo-concordium_${VERSION}"
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
                    image 'concordium/base:latest'
                    args '-u root'
                } 
            }
            steps {
                sh '''\
                    # Set rust env
                    rustup target add x86_64-unknown-linux-musl

                    cd cargo-concordium

                    # Build
                    cargo build --target x86_64-unknown-linux-musl --release


                    # Prepare output
                    mkdir ../out
                    cp target/x86_64-unknown-linux-musl/release/cargo-concordium ../out/
                '''.stripIndent()
                stash includes: 'out/cargo-concordium', name: 'release'
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
                    aws s3 cp "out/cargo-concordium" "${OUTFILE}" --grants read=uri=http://acs.amazonaws.com/groups/global/AllUsers
                '''.stripIndent()
            }
        }
    }
}
