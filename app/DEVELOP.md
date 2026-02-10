# Developer readme

Follow these steps to start hacking with the komunitin app.

## Get started
Follow these steps to build and run Komunitin in a development local environment.

### Download
Get the code

```bash
git clone https://github.com/komunitin/komunitin.git
cd komunitin/app
```

### Install

Install the [Quasar framework](https://quasar.dev/), a develompent framework built over [Vue.js](https://vuejs.org/).

```bash
pnpm install
```
### Install local certificates
 - Install [mkcert](https://github.com/FiloSottile/mkcert#installation)
 - Create local CA root and set the `LOCAL_CA_ROOT` env variable:
```bash
mkcert -install
export LOCAL_CA_ROOT="$(mkcert -CAROOT)/rootCA.pem"
```
 - Create certificates for localhost
```bash
mkdir -p tmp/certs && cd tmp/certs
mkcert localhost
```

### Run standalone
You can configure some properties such as where the backend services are located. The quickest way to run the app is to use the mocked version for all external apis:
Build and launch the development HTTP server, that will make the app accessible at `https://localhost:2030/`. The app uses a mocked api for the backend services.

```bash
cp .env.test .env
pnpm dev
```

### Run with local services
- Launch the docker compose for Komunitin following the instructions in the [main README](../README.md).
- Stop the `app` container
- Run the app with the local services:
```bash
cp .env.local .env
pnpm dev
```

### Visual Studio Code

We use the de development IDE Visual Studio Code. [Follow this page](https://quasar.dev/start/vs-code-configuration) to set it up.

### Test

Launch the [Jest](https://jestjs.io/) testing framework for unit testing with:

```bash
pnpm test
```

### Mocking API

We use [Mirage](https://miragejs.com/) library for backend API mocking. It is enabled by default in `pnpm dev` script.

### Lint
We use the [ESLint](https://eslint.org/) linter for static code analysis. Launch it with:
```bash
pnpm lint
```

### Build
```bash
pnpm build
```

### Docker

Build the image
```bash
docker build --tag komunitin/komunitin-app .
```
Launch application in port 2030:
```bash
docker run -d -p 2030:80 --name komunitin-app komunitin/komunitin-app
```
Open browser at `http://localhost:2030`

## Style guide
We state some guidelines in order to keep coherency among the Komunitin codebase. We use the [Quasar](https://quasar.dev) framework based on [VueJS](https://vuejs.org) with [TypeScript](www.typescriptlang.org). We try to follow the industry best practices from this technology stack.


### Structure
Keep the following folder structure:
- `src/layouts`: Vue components starting with `<q-layout>` component.
- `src/pages`: Vue components that are requested from the router. These components have the methods to fetch data from the [Komunitin API](https://github.com/komunitin/komunitin-api).
- `src/components`: Vue components embedded in pages, such as cards. They get the data by props.
- `src/i18n`: Translations.
- `src/plugins`: Custom [Vue plugins](https://vuejs.org/v2/guide/plugins.html).

### CSS
We try to write as less CSS as possible in custom components, and most of them don't have CSS at all. Instead, we rely on the standard classes provided by Quasar framework. See [Introduction to Flexbox](https://quasar.dev/layout/grid/introduction-to-flexbox) and [Spacing classes](https://quasar.dev/style/spacing#Syntax) for documentation. Exceptionally, additional app-wide classes may be defined at `src/css/app.sass` file for a feature not provided by Quasar. 

If the component has a non-standard style feature, it will be defined using scoped [SCSS](https://sass-lang.com/documentation/syntax) language.

Colors are defined as variables and standard classes at `src/css/quasar.variables.sass`. We have, for example, the colors `$primary`, `$secondary`, `$surface` and `$outside` for backgrounds and the corresponding `$onprimary`, `$onsecondary` etc for text on them. We also have `$onsurface-m` for medium emphasis text.

### Code
- All code is written in TypeScript.
- Components must be created using the `<script setup>` Vue construction.
- Asynchronous code is written using the `async/await` pattern, and not the Promises API.
- Error managing is done using the `KError` object, a custom extension of JavaScript `Error` object. When an exception occurs, the code must create a `KError` object with the proper error code from `KErrorCode` enumeration. Then it may just throw it or, if the code knows how to recover, log it using the `$handleError` injected function from `boot/errors.ts` and continue the execution.

### Data
We use [Vuex](https://vuex.vuejs.org/) to store the data fetched from the backend(s), using the standard pattern:
!(https://vuex.vuejs.org/vuex.png)

Each resource type si stored in a Vuex module that provide actions to load the resources from the API and getters to obtain the values. Relationships are
automatically bind to the provided resources using JavaScript getter functions.

### Functional testing
Functional tests check that app features are working, contrasted to unit tests that check that a particular chunk of code is working. Tests are executed by [NodeJS](https://nodejs.org/) with the [Jest](https://jestjs.io/) framework with a mocked Browser environment. This way tests are much more estable than end to end tests using a full browser and also more meaningful than unit tests.

We've defined a utility module under `/test/jest/utils` with a function `mountComponent` that helps mounting a fully-featured Vue component for our app with all the required environment. It contains the needed plugins, Quasar components, executes boot files and has some handful mocks. You may add additional options by adding the options parameter as in `@vue/test-utils` `mount` function.

Developers are encouraged to create functional tests for their features and place them under `/test/jest/__tests__` folder.

### Unit testing
For those Vue components or modules that are more complex, developers are encouraged to create unit tests too. Unit tests are placed under `__tests__` folder next to the file being tested. Remember that unit tests should not test code outside the file being tested. For tests involving more than one component or module, use functional tests instead.

Unit tests for Vue components should use the utilities from `@vue/test-utils` instead of our custom `mountComponent` because of performace, since it does not need to set up all the environment but just the minimum to run the code in an isolated environment.
