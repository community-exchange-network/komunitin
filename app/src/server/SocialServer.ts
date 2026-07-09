// Mirage typings are not perfect and sometimes we must use any.
/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Server} from "miragejs";
import { Model, belongsTo, hasMany, Factory, Response } from "miragejs";
import faker from "faker";
import { badRequest, filter, notFound } from "./ServerUtils"

import { getContactNetworkKeys } from "../utils/social-networks";
import { config } from "src/utils/config";
import ApiSerializer from "./ApiSerializer";
import { inflections } from "inflected"


const urlSocial = config.SOCIAL_URL;
const urlAccounting = config.ACCOUNTING_URL;

const contactTypes = getContactNetworkKeys();

inflections("en", function (inflect) {
  inflect.irregular("userSettings", "userSettings")
  inflect.irregular("groupSettings", "groupSettings")
})

function fakeMarkdown(paragraphs: number): string {
  let text = "";
  for (let i = 0; i < paragraphs; i++) {
    const sentences = faker.random.number({ min: 2, max: 20 });
    for (let j = 0; j < sentences; j++) {
      let sentence = faker.lorem.sentence();
      if ((i + j) % 8 == 0 && faker.random.boolean()) {
        sentence = "*" + sentence + "*";
      }
      if ((i + j) % 10 == 0 && faker.random.boolean()) {
        sentence = "**" + sentence + "**";
      }
      text += sentence + " ";
    }
    text += "\n\n";
  }
  return text;
}

function fakeContactName(type: string) {
  switch (type) {
    case "whatsapp":
    case "phone":
      return faker.phone.phoneNumberFormat();
    case "telegram":
      return faker.internet.userName();
    case "website":
      return faker.internet.url();
    default:
      return faker.internet.email();
  }
}

function fakeContacts(count = 4) {
  return Array.from({ length: count }, (_, i) => {
    const type = contactTypes[i % contactTypes.length];
    return {
      type,
      value: fakeContactName(type)
    };
  });
}

// [longitude, latitude]
function fakeLocation() {
  return {
    name: faker.address.county(),
    type: "Point",
    coordinates: [faker.random.number({min:-10, max:40, precision: 4}), faker.random.number({min:0, max:60, precision: 4})]
  };
}

function fakeAddress() {
  return {
    streetAddress: faker.address.streetAddress(),
    addressLocality: faker.address.city(),
    postalCode: faker.address.zipCode(),
    addressRegion: faker.address.county(),
    addressCountry: faker.address.countryCode()
  };
}

function fakeImage(search = "", size = "800x600") {
  return {
    url: `https://picsum.photos/seed/${search}/${size.replace("x", "/")}`,
    alt: search
  };
}

function fakeCategoryIconName(i: number): string {
  const icons = ["accessibility_new", "accessible_forward", "account_balance", "build", "eco", "house", "agriculture", "hotel", "pedal_bike", "restaurant", "clean_hands"];
  return icons[i % icons.length];
}

function fakePrice(i:number): string {
  if (i % 2 == 0) {
    return "" + (i/100.0)
  } else {
    if (i % 4 == 1) {
      return "Request a quote";
    } else {
      return "Contact me!";
    }
  }
}

function includes(request: any, value: string) {
  return (request.queryParams.include ?? "").split(",").includes(value);
}

function withoutQuery(request: any, names: string[]) {
  return {
    ...request,
    queryParams: Object.fromEntries(
      Object.entries(request.queryParams).filter(([key]) => !names.includes(key))
    )
  };
}

function sortByDistance(records: any, request: any) {
  if (!request.queryParams.near || request.queryParams.sort != "distance") {
    return records;
  }
  const [lat, lng] = request.queryParams.near.split(",").map(Number);
  const distance = (record: any) => {
    const coordinates = record.location?.coordinates;
    return coordinates ? Math.pow(coordinates[1] - lat, 2) + Math.pow(coordinates[0] - lng, 2) : Infinity;
  };
  return records.sort((a: any, b: any) => distance(a) - distance(b));
}

/**
 * Object containing the properties to create a MirageJS server that mocks the
 * Komunitin Social API.
 */
export default {
  // Use Mirage JSONAPISerializer to serialize models defined here.
  serializers: {
    group: ApiSerializer.extend({
      links(group: any) {
        const links = {} as { [key: string]: { related: string } };
        (Object.values(group.associations)).forEach(
          (association: any) => {
            links[association.name] = {
              related: ((association.name == "currency") ? urlAccounting : urlSocial) + "/" + group.code + "/" + association.name
            };
          }
        );
        // Only include members and posts for the first two groups, emulating
        // forbidden access.
        if (!["GRP0", "GRP1"].includes(group.code)) {
          delete links['members']
          delete links['posts']
        }
        return links;
      },
      selfLink: (group: any) => urlSocial + "/" + group.code,
      isExternal(relationshipKey: string) {
        return relationshipKey == "currency";
      },
    }),
    member: ApiSerializer.extend({
      selfLink: (member: any) =>
        urlSocial + "/" + member.group.code + "/members/" + member.id,
      isExternal(relationshipKey: string) {
        return relationshipKey == "account";
      },
      links: (member: any) => {
        return {
          account: {
            related: `${urlAccounting}/${member.group.code}/accounts/${member.account?.id}`
          }
        }
      }
    }),
    category: ApiSerializer.extend({
      links(category: any) {
        return {
          posts: {
            related: `${urlSocial}/${category.group.code}/posts?filter[category]=${category.id}`
          }
        };
      },
      selfLink: (category: any) =>
        urlSocial + "/" + category.group.code + "/categories/" + category.id
    }),
    post: ApiSerializer.extend({
      getResourceObjectForModel(model: any) {
        const json = ApiSerializer.prototype.getResourceObjectForModel.apply(this, [model]);
        delete json.attributes.type;
        return json;
      },
      typeKeyForModel(model: any) {
        return model.type
      },
      selfLink: (post: any) =>
        urlSocial + "/" + post.group.code + "/posts/" + post.id
    }),
    user: ApiSerializer.extend({
      selfLink: (user: any) => `${urlSocial}/users/${user.id}`,
    }),
    userSettings: ApiSerializer.extend({
      selfLink: (settings: any) => `${urlSocial}/users/${settings.id}/settings`
    }),
    groupSettings: ApiSerializer.extend({
      selfLink: (groupSettings: any) => urlSocial + "/" + groupSettings.group.code + "/settings"
    }),
  },
  models: {
    user: Model.extend({
      members: hasMany(),
      settings: belongsTo("userSettings")
    }),
    userSettings: Model.extend({
      user: belongsTo()
    }),
    group: Model.extend({
      members: hasMany(),
      categories: hasMany(),
      posts: hasMany(),
      currency: belongsTo(),
      settings: belongsTo("groupSettings")
    }),
    groupSettings: Model.extend({
      group: belongsTo()
    }),
    member: Model.extend({
      group: belongsTo(),
      account: belongsTo(),
      posts: hasMany(),
    }),
    category: Model.extend({
      group: belongsTo(),
      posts: hasMany()
    }),
    post: Model.extend({
      category: belongsTo(),
      group: belongsTo(),
      member: belongsTo()
    })
  },
  factories: {
    user: Factory.extend({
      email: () => faker.internet.email(),
      created: () => faker.date.past(),
      updated: () => faker.date.past(),
    }),
    userSettings: Factory.extend({
      language: "en-us",
      notifications: {
        myAccount: true,
        group: true
      },
      emails: {
        myAccount: true,
        group: "weekly"
      }
    }),
    group: Factory.extend({
      code: (i: number) => `GRP${i}`,
      name: (i: number) => `Group ${i}`,
      status: "active",
      description: () => fakeMarkdown(4),
      image: (i: number) => (i % 2 == 0) ? fakeImage(`group${i}`) : null,
      contacts: () => fakeContacts(),
      address: () => {
        return {
          addressLocality: "Barcelona",
          addressCountry: "ES",
          addressRegion: "Catalunya"
        }
      },
      access: "public",
      location: () => fakeLocation(),
      created: () => faker.date.past().toJSON(),
      updated: () => faker.date.recent().toJSON()
    }),
    member: Factory.extend({
      code() {
        return faker.internet.userName(this.name);
      },
      access: "public",
      status: "active",
      type: () => faker.random.arrayElement(["personal", "business", "organization"]),
      name: () => faker.name.findName(),
      description: () => fakeMarkdown(2),
      image: (i: number) => (i % 3 == 0) ? null : fakeImage(`face-${i}`, "100x100"),
      contacts: () => fakeContacts(),
      address: () => fakeAddress(),
      location: () => fakeLocation(),
      created: () => faker.date.past(),
      updated: () => faker.date.recent()
    }),
    category: Factory.extend({
      code() {
        return faker.helpers.slugify(this.name);
      },
      name: () => faker.commerce.department(),
      icon: (i: number) => (i % 3 == 1) ? null : {
        type: "material",
        value: fakeCategoryIconName(i)
      },
      access: "public",
      meta: () => ({
        description: faker.lorem.sentence()
      }),
      created: () => faker.date.past(),
      updated: () => faker.date.past(),
    }),
    post: Factory.extend({
      type: "offers",
      title: () => faker.commerce.product(),
      code(i: number) {
        return faker.helpers.slugify(this.title) + i;
      },
      description: () => fakeMarkdown(faker.random.number({ min: 1, max: 3 })),
      value: () => fakePrice(faker.random.number({min: 1, max:1000})),
      images: (i: number) =>
        Array.from(
          { length: faker.random.number({ min: 0, max: 5 }) },
          (v: never, j: number) => fakeImage(`product${i}-${j}`),
        ),
      access: "public",
      status: "published",
      fulfilled() {
        return this.type == "needs" ? null : undefined;
      },
      expires: () => faker.date.future().toJSON(),
      created: () => faker.date.past().toJSON(),
      updated: () => faker.date.recent().toJSON()
    }),
    groupSettings: Factory.extend({
      requireAcceptTerms: true,
      terms: () => fakeMarkdown(2),
      minOffers: 1,
      minNeeds: 0
    })
  },
  seeds(server: Server) {
    faker.seed(1);
    // Create groups.
    server.createList("group", 7).forEach((group, i) => {
      // Create signup settings.
      const settings = server.create("groupSettings", { group } as any);
      group.update({ settings });
      // Only add data for the first group. Otherwise we spend a lot of
      // time in this function.
      if (i == 0) {
        // Create categories.
        faker.seed(2030);
        const categories = server.createList("category", 5, { group } as any);
        // Create group members
        faker.seed(1);
        const members = server.createList("member", 30, { group } as any);
        for (let j = 0; j < members.length; j++) {
          const member = members[j];
          // Create member posts only for the first 10 members.
          if (j < 10) {
            const category = categories[j % categories.length];
            faker.seed(j);
            server.createList("post", 3, {
              type: "offers",
              member,
              category,
              group
            } as any);
            // Create member needs only for some members.
            if (j % 3 == 0) {
              faker.seed(j);
              server.createList("post", (j % 3) + 1, {
                type: "needs",
                value: undefined,
                member,
                category: categories[j % categories.length],
                group
              } as any);
            }
          }
        }
      }
      // Create some mebers in GRP1 just to test external transfers.
      if (i == 1) {
        server.createList("member", 5, { group } as any);
      }
    });

    // Users and user settings for all members
    (server.schema as any).members.all().models.forEach((member: any) => {
      const user = server.create("user", {
        members: [member]
      } as any);
      server.create("userSettings", { user } as any);	
    });
    
    // Create empty user (for signup testing).
    server.create("user", {
      email: "empty@example.com",
      members: [
        server.create("member", { 
          name: "Empty User",
          code: "empty_user",
          status: "pending",
          type: undefined,
          description: undefined,
          image: undefined,
          address: undefined,
          location: undefined,
          group: (server.schema as any).groups.first()
        } as any)
      ],
      settings: server.create("userSettings")
    } as any)
  },
  routes(server: Server) {
    // All groups
    server.get(urlSocial + "/groups", (schema: any, request) => {
      const records = filter(schema.groups.all(), withoutQuery(request, ["near"]));
      return sortByDistance(records, request);
    });

    // Single group
    server.get(urlSocial + "/:code", (schema: any, request) => {
      return schema.groups.findBy({ code: request.params.code });
    });

    // Edit group attributes
    server.patch(urlSocial + "/:code", (schema: any, request) => {
      const group = schema.groups.findBy({ code: request.params.code });
      const body = JSON.parse(request.requestBody);
      group.update(body.data.attributes);
      return group;
    });

    // Group settings
    server.get(urlSocial + "/:code/settings", (schema: any, request) => {
      const group = schema.groups.findBy({ code: request.params.code });
      return group.settings;
    });

    // Edit group settings
    server.patch(urlSocial + "/:code/settings", (schema: any, request) => {
      const group = schema.groups.findBy({ code: request.params.code });
      const body = JSON.parse(request.requestBody);
      group.settings.update(body.data.attributes);
      return group.settings;
    });

    // Group categories.
    server.get(urlSocial + "/:code/categories", (schema: any, request) => {
      const group = schema.groups.findBy({ code: request.params.code });
      return filter(schema.categories.where({ groupId: group.id }), request);
    });

    // Create category
    server.post(urlSocial + "/:code/categories", (schema: any, request: any) => {
      const body = JSON.parse(request.requestBody);
      const category = {
        ...body.data.attributes,
        created: new Date().toJSON(),
        updated: new Date().toJSON(),
        groupId: schema.groups.findBy({ code: request.params.code }).id
      }
      return schema.categories.create(category);
    })

    // Update category
    server.patch(urlSocial + "/:code/categories/:category", (schema: any, request: any) => {
      const body = JSON.parse(request.requestBody);
      const category = schema.categories.find(request.params.category);
      category.update({
        ...body.data.attributes,
        updated: new Date().toJSON(),
      })
      return category;
    })

    // Delete category
    server.delete(urlSocial + "/:code/categories/:category", (schema: any, request: any) => {
      const category = schema.categories.find(request.params.category);
      category.destroy();
      return new Response(204);
    })

    // Group posts.
    server.get(urlSocial + "/:code/posts", (schema: any, request: any) => {
      const group = schema.groups.findBy({ code: request.params.code });
      return filter(schema.posts.where({ groupId: group.id }), request);
    });

    // Group members.
    server.get(urlSocial + "/:code/members", (schema: any, request: any) => {
      const group = schema.groups.findBy({ code: request.params.code });
      return filter(schema.members.where({ groupId: group.id }), request);
    });

    // Get group signup settings
    server.get(urlSocial + "/:code/settings", (schema: any, request: any) => {
      const group = schema.groups.findBy({ code: request.params.code });
      return group.settings;
    });

    // Single member.
    server.get(urlSocial + "/:code/members/:member", (schema: any, request: any) => {
      return schema.members.find(request.params.member)
    });

    // Edit member profile
    server.patch(urlSocial + "/:code/members/:member", (schema: any, request: any) => {
      const member = schema.members.find(request.params.member)
      const body = JSON.parse(request.requestBody);
      member.update(body.data.attributes);
      return member;
    });

    // Delete member
    server.delete(urlSocial + "/:code/members/:id", (schema: any, request: any) => {
      const member = schema.members.find(request.params.id);
      const account = member.account;
      const users = schema.users.where((user: any) => user.memberIds.some((id: any) => id == member.id));
      
      account.destroy();
      member.destroy();
      users.models.forEach((user: any) => user.destroy());

      return undefined as any;
    })

    // Single post.
    server.get(urlSocial + "/:code/posts/:post", (schema: any, request: any) => {
      return schema.posts.find(request.params.post);
    });

    // Create post
    server.post(urlSocial + "/:code/posts", (schema: any, request: any) => {
      const body = JSON.parse(request.requestBody);
      const type = body.data.type == "needs" ? "needs" : "offers";
      const post = {
        ...body.data.attributes,
        type,
        code: faker.helpers.slugify((body.data.attributes.title ?? body.data.attributes.description).substr(0, 10)),
        created: new Date().toJSON(),
        updated: new Date().toJSON(),
        groupId: schema.groups.findBy({ code: request.params.code }).id,
        memberId: body.data.relationships.member.data.id,
        categoryId: body.data.relationships.category.data.id,
      }
      return schema.posts.create(post);
    })

    // Update post
    server.patch(urlSocial + "/:code/posts/:post", (schema: any, request: any) => {
      const body = JSON.parse(request.requestBody);
      const post = schema.posts.find(request.params.post);
      post.update({
        ...body.data.attributes,
        updated: new Date().toJSON(),
      })
      return post;
    })

    // Delete post
    server.delete(urlSocial + "/:code/posts/:post", (schema: any, request: any) => {
      const post = schema.posts.find(request.params.post);
      post.destroy();
      return undefined as any
    })

    server.get(urlSocial + "/users", (schema: any, request: any) => {
      const users = filter(schema.users.all(), request);
      return users;
    });

    // User members
    server.get(urlSocial + "/users/:id/members", (schema: any, request: any) => {
      if (request.params.id == "me") {
        return notFound();
      }
      return filter(schema.users.find(request.params.id).members, request);
    });

    // Logged-in User
    server.get(urlSocial + "/users/:id", (schema: any, request: any) => {
      if (includes(request, "members")) {
        return badRequest("Use /users/:id/members");
      }
      if (request.requestHeaders.Authorization.split(" ")[1] == "empty_user_access_token") {
        return schema.users.findBy({ email: "empty@example.com" });
      } else {
        return (request.params.id === "me" 
          ? schema.users.first() 
          : schema.users.find(request.params.id)
        );
      }
    });

    // User settings
    server.get(urlSocial + "/users/:id/settings", (schema: any, request: any) => {
      return (request.params.id === "me" 
        ? schema.userSettings.first() 
        : schema.users.find(request.params.id).settings
      )
    });

    // Edit user settings
    server.patch(urlSocial + "/users/:id/settings", (schema: any, request: any) => {
      const body = JSON.parse(request.requestBody);
      const settings = (request.params.id === "me" 
        ? schema.userSettings.first() 
        : schema.users.find(request.params.id).settings
      )
      settings.update(body.data.attributes);
      return settings;
    });

    // Create user.
    server.post(urlSocial + "/users", (schema: any, request: any) => {
      const body = JSON.parse(request.requestBody)
      if (body.data.attributes.password || body.data.relationships?.members) {
        return badRequest("Social users do not include credentials or members");
      }

      const userSettingsData = body.included?.find((record: any) => record.type == "user-settings")
      const userSettings = userSettingsData ? schema.userSettings.create(userSettingsData.attributes) : undefined
      const user = schema.users.create({...body.data.attributes, settings: userSettings})

      return user
    });

  }
};
