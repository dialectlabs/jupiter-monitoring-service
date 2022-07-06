service_version=$(jq -r .version package.json)
service_name=$( jq -r .name package.json | cut -d "/" -f2)

docker push dialectlab/"${service_name}":"${service_version}"
docker push dialectlab/"${service_name}":latest
