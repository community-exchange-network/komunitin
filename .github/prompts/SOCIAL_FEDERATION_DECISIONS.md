### Access model
 - Groups can be "public" or "private". Private groups do not participate in federation at all. Public groups share their main attributes (name, location, description, image, etc) publicly and are listed anonymously on /groups endpoint.
 - Members can be "public" or "group". Public members share their main attributes (name, avatar, bio, location, etc) publicly, while "group" members only share their attributes within the group context. However, if
 anonymous member listing is enabled for the community, "group" members are also listed with a restricted set of attributes (only name, avatar, code).
 - Posts can be "public" or "group". Public posts are shared publicly, while "group" posts are only shared with community members. Note that a "public" post from a "group" member will show post data but hide member details.

### Future access model
While we only implement the group/public access options for now, we may support more granular access controls in the future, including:

 - Members can follow other members or whole communities. Posts from followed members appear on their personal feed, alongside local content.
 - Author chooses which communities can access their posts. Either choosing specific communities or choosing a predefined admin list of "friend communities".
 - Author chooses to allow all remote followers to access their posts in addition to the local or configured communities.

These requirements won't be implemented immediately but they provide guidance on the data and federation model to setup now.


### ActivityPub object

We define one type of object for posts, compatible with microblogging ActivityPub apps including Mastodon, and also trying to accomodate [ValueFlows](https://valueflo.ws/) ontology and the [Federated Marketplace protocol extension](https://codeberg.org/fediverse/fep/src/branch/main/fep/0837/fep-0837.md).

Specifically:
```text
  Note
  ├── id: https://social.a.example/GROUP/ap/notes/123
  ├── attributedTo: https://social.a.example/GROUP/ap/members/alice
  ├── audience: https://social.a.example/GROUP/ap/group
  ├── content: Rendered HTML representation of the post (with title, body excerpt, value and link).
  ├── url: https://app.a.example/GROUP/offers/bicycle-repairs
  └── attachment
      ├── Document: Image
      └── Proposal
          ├── id: https://social.a.example/GROUP/ap/publications/123#proposal
          ├── name: Post title
          ├── content: Post full body
          ├── mediaType: text/markdown
          ├── endTime: Expiration date
          ├── purpose: offer / request
          ├── publishes: Intent
          |   ├── action: deliverService
          |   └── resourceConformsTo: 
          |   
          └── reciprocal: Intent (what the proposal expects in return)
```

#### Example

```json
{
  "@context": [
    "https://www.w3.org/ns/activitystreams",
    "https://w3id.org/fep/0837"
  ],
  "id": "https://a.example/activities/create-123",
  "type": "Create",
  "actor": "https://a.example/members/alice",
  "to": ["https://www.w3.org/ns/activitystreams#Public"],
  "object": {
    "id": "https://a.example/publications/123",
    "type": "Note",
    "attributedTo": "https://a.example/members/alice",
    "audience": "https://a.example/communities/community-1",
    "to": ["https://www.w3.org/ns/activitystreams#Public"],
    "published": "2026-10-14T10:00:00Z",
    "url": "https://a.example/offers/bicycle-repairs",
    "content": "<p><strong>Offer: Bicycle repairs</strong></p><p>I can help with punctures and basic bicycle maintenance.</p><p>Value: 25 credits or barter.</p><p><a href=\"https://a.example/offers/bicycle-repairs\">View offer</a></p>",
    "attachment": [
      {
        "id": "https://a.example/publications/123#proposal",
        "type": "Proposal",
        "purpose": "offer",
        "attributedTo": "https://a.example/members/alice",
        "to": ["https://www.w3.org/ns/activitystreams#Public"],
        "name": "Bicycle repairs",
        "content": "I can help with punctures and basic bicycle maintenance.",
        "reciprocal": {
          "type": "Intent",
          "vf:note": "25 credits or barter"
        }
      }
    ]
  }
}
```





### Data layer:

- Local posts are still stored in existing Posts table.
- There is a store for federated posts, shared across all tenants in an instance.
- Federated posts are a projection of posts, and include all local posts.
- Each tenant has a mapping to the federated posts store, telling which records can be accessed by the tenant. This is then enforced using Postgres RLS.
- As an optimization, public posts may have a NULL mapping meaning "all tenants can access".


Discovery:
- There is a JSON file, with URL configurable per instance using env var, defining the set of peer komunitin server instances.
- Instance subscribes to each peer komunitin server instance.
