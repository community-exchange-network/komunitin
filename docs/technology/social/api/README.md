# API

REST API featuring marketplace services for Exchange Communities.

This API provides access to exchange community details, member profile and their offers and needs and informational messages. It doesn't feature transfers nor any accounting information, as this is available in a separate API.\


Browse the specification using Swagger here:

{% embed url="https://petstore.swagger.io/?url=https://raw.githubusercontent.com/komunitin/komunitin-api/refs/heads/master/social/openapi.yaml" %}

### Format

This specification is based on the [JSON:API](https://jsonapi.org/) standard. Some additional format conventions are addopted.

#### URLs

* The URL structure starts with the community code, so it eases the service isolation among different exchange communities in a single server, as there is no way to ask for resources from different communities. The only exception is the global `/groups` endpoint.
* Clients should honor the links provided by API responses and not try to construct the URL's using the known structure defined in this document. This way it decouples client andserver from URL design, making the server fully responsible of URLs.

#### Ids

* All resources have a global UUID identifier as their `id` field, but the URLs are human-readable. The URLs are meant to be almost immutable to allow caching and others, but can occasinally change (for example, in case of server migration), while the UUIDs are really immutable.
* All resources have a `code` field. This field is automatically generated from other resource fields (typically the title). It is a human-readable URL-safe string that is unique within the scope of the exchange community. It is used to build human-readable URLs. Clients should not assume that the `code` fields will be forever immutable, and should use the `id` field for that. However they may use the `code` field if they must create an identifier that will be exposed to users.

#### Data types

* Geolocation fields follow the [GeoJSON](https://geojson.org/) specification. Note that the spec allows to specify either a concrete point or an area. An additional field `name` may appear in Geolocation fields, which is a text title for the location.
* Date or time fields follow the [RFC3339](https://tools.ietf.org/html/rfc3339) specification.
* Long text fields allow formatting through a restricted set of HTML tags.

#### Structure

This section extensively use the [JSON:API](https://jsonapi.org/) language.

* When fetching individual resources, no `links` member is provided in the top level document.
* Resources have a `links` member with the `self` attribute, containing the canonical URL for this resource.
* Relationships don't have a `self` attribute and are not directly operable. They must be edited through the resource endpoint. In one-to-many relationships, they must be edited using the "many" endpoint of the relation. For example, the relation between offers and categories must be edited using the `offers` endpoints.
* Relationships have either a `related` attribute when they are not included or the `data` attribute with the resource identifier objects when they are included in a compound document. In this latter case, the `links` member may be present with pagination when not all related resources are embedded.
* Exchnage relationship is always implicitely defined in the path.

#### Filtering

Filtering is available in all endpoints that return a collection following the custom [Simple filtering](https://github.com/komunitin/komunitin-api/blob/master/jsonapi-profiles/filter.md) JSON:API profile.

#### Pagination

Pagination is available in all endpoints that return a collection following the official [Cursor Pagination](https://jsonapi.org/profiles/ethanresnick/cursor-pagination/) JSON:API profile.

#### Versioning

Clients should allow additional fields along all JSON responses. Therefore adding new fields won't be considered breaking backwards compatibility. API versioning is done using HTTP headers (still to specify).

### Resource objects

The whole API is designed as a set of resources and CRUD operations on them.

#### Communities

Communities represent the different exchange communities. They have a logo, description, location, contact points, etc. Communities have a link to their corresponding currency in the Accounting API.

All other resources belong to a particular community. The endpoints in one community are separated from other communities, and the implementators are recommended to isolate the data in different databases too.

Special administrative rights must be held in order to change community details.

#### Members

Members are the subject of this API. They need not to be physical people, but can be businesses, non-profit organizations, etc. They have profile information, contact points and may create offers and needs. Members have a link to their corresponding account in the Accounting API.

#### Users

Users are objects representing the login credentials. A user is linked to one or more members, which carry the actual profile information. Users are the link between the authentication service and this API and allow to manage several members from a single log in and also sharing members accross diferent users without having to share the credentials.

#### Contacts

Represent a contact point of a member or an exchange community. It may be a telephone number, email address, WhatsApp or Telegram contacts. A contact is always attached to either a member or a community. Contact resources are included by default in they owner resources, and can't be directly listed, so they act effectively as sub-resources of community and member resources.

#### Categories

Offers and needs are organized in categories. An offer or need can only belong to a single category. Good and service categories can be customized for each community.

In order to make categories interoperable, they are mapped to the set of categories defined at [Statistical Classification of Products by Activity in the European Union, Version 2.1](https://ec.europa.eu/eurostat/ramon/nomenclatures/index.cfm?TargetUrl=LST_NOM_DTL\&StrNom=CPA_2_1\&StrLanguageCode=EN\&IntPcKey=\&StrLayoutCode=HIERARCHIC) (CPA). CPA has been chosen over other classifications because it is already translated to many languages and publicly accessible in machine-readable format. Note that CPA categories are not visible to end-users, just to community administrators.

#### Offers

Offers are publications created by members to advertize the goods and services they are willing to sell through the exchange system. They should include one or more images and have a title and a detailed description. Usually they are long-lived.

#### Needs

Needs are short publications created by members to request any good or service from the exchange community. They include a short description and are usually short-lived.

#### Posts

Posts are messages written by the exchange community administration to reach all members in the exchange community. Posts resource may be extended in a future for more flexible audiences, but at the moment we prefer to use external messaging systems for that purpose.

### Data privacy

Access to all resources may be restricted by assigning one of the predefined access labels to the `access` resource field.

* `private`: The resource is only accessible by its owner.
* `group`: The resource is only accessible by the members of the same exchange community.
* `public`: The resource is publicly accessible on the internet. Note that in order for members in other exchange communities to access a resource, it must be declared public. Public resources are also accessible by non-logged users when they browse the community network before registering.

In a future, other access labels may be added (friends, contacts, community:XXXX, etc) and the `access` field may accept multiple labels for a resource.

### Relation to other APIs

#### Authorization

Authorization endpoints are out of the scope of this API, which expects the user to be authorized with an OAuth2 access token. The access token is provided by a separate authorization API. The recommended OAuth2 flow for web apps and native apps is the Authorization Code Flow with Proof Key for Code Exchange (PKCE).

A general `komunitin_social` OAuth2 scope is required to access this API.

#### Accounting

This API depends on an Accounting service wich by default is the [Komunitin Accounting Protocol](https://github.com/komunitin/komunitin-api/blob/master/accounting/README.md). However the definition allows to replace it by another accounting API that has the concepts of currency and account.

Concretely, the `group` resource has the `currency` external relationship and the `member` resource has the `account` external relationship.

External relaitonships are defined in a custom extension profile of JSON:API: [External relationships](https://github.com/komunitin/komunitin-api/blob/master/jsonapi-profiles/external.md).

The similar structure helps implementators to reuse some of the code handling relationships, although the automatic inclusion is not generally available for external relationships.

#### Media

File server is out of the scope of this API, and should be handled using a separate specialized service. This way we ease the implementation of advanced upload techniques and efficient delivery of static binary files. File URLs should be randomized in order to minimize unauthorized access to files. Additional security measures such as short-lived Signed URLs can be implemented to further restrict access to binary files.\


\
