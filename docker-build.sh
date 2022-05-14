package_version=$(jq -r .version package.json)

docker build --platform linux/amd64 \
  -t dialectlab/realms-monitoring-service:"$package_version" \
  -t dialectlab/realms-monitoring-service:latest .