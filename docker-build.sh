service_version=$(jq -r .version package.json)
service_name=$( jq -r .name package.json | cut -d "/" -f2)

docker build --platform linux/amd64 \
  -t dialectlab/"${service_name}":"${service_version}" \
  -t dialectlab/"${service_name}":latest .
