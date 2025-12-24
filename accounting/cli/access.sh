usage() {
  echo "Usage: $0 <user> <password> <ices_url> [additional_scopes]"
  exit 1
}

if [ $# -lt 3 ]; then
    usage
fi

USERNAME=$1
PASSWORD=$2
ICES_URL=$3
ADDITIONAL_SCOPES=$4

# Base scopes
BASE_SCOPES="openid email profile komunitin_social komunitin_accounting offline_access"

# Add additional scopes if provided
if [ -n "$ADDITIONAL_SCOPES" ]; then
    SCOPES="$BASE_SCOPES $ADDITIONAL_SCOPES"
else
    SCOPES="$BASE_SCOPES"
fi

RESPONSE=$(curl -s -X POST $ICES_URL/oauth2/token \
-H "Content-Type: application/x-www-form-urlencoded" \
-d "grant_type=password" \
-d "client_id=komunitin-app" \
-d "username=$USERNAME" \
-d "password=$PASSWORD" \
-d "scope=$SCOPES")

ACCESS_TOKEN=$(echo $RESPONSE | grep -o '"access_token":"[^"]*' | sed 's/"access_token":"//')

# Check if the access token is empty
if [ -z "$ACCESS_TOKEN" ]; then
    echo "Error: Invalid credentials"
    echo $RESPONSE
    exit 1
fi

# Return parsed access token
echo $ACCESS_TOKEN
