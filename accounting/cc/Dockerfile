FROM php:8.3-apache
RUN /bin/sh -c echo 'deb [ signed-by=/etc/apt/keyrings/mysql.gpg ] http://repo.mysql.com/apt/debian/ bookworm mysql-8.0' > /etc/apt/sources.list.d/mysql.list
RUN apt update
RUN apt install -yq git libzip-dev vim wget sudo default-mysql-server locales
RUN locale-gen en_US
RUN locale-gen en_US.UTF-8
RUN cp /usr/local/etc/php/php.ini-development /usr/local/etc/php/php.ini
RUN pecl install xdebug \
    && docker-php-ext-enable xdebug
RUN docker-php-ext-install -j$(nproc) mysqli \
    && docker-php-ext-install zip \
    && a2enmod rewrite
RUN wget https://raw.githubusercontent.com/composer/getcomposer.org/f3108f64b4e1c1ce6eb462b159956461592b3e3e/web/installer -O - -q | php -- --quiet
RUN mv composer.phar /usr/local/bin/composer
# WORKDIR /workspaces/cc-server
RUN echo "export LANGUAGE=C" > /root/.bashrc
RUN echo "export LC_CTYPE=C" > /root/.bashrc
RUN echo "export LC_MESSAGES=C" > /root/.bashrc
RUN echo "export LC_ALL=C" > /root/.bashrc
RUN pwd
RUN echo "<Directory /workspaces/cc-server/>" >> /etc/apache2/apache2.conf
RUN echo "        Options Indexes FollowSymLinks" >> /etc/apache2/apache2.conf
RUN echo "        AllowOverride None" >> /etc/apache2/apache2.conf
RUN echo "        Require all granted" >> /etc/apache2/apache2.conf
RUN echo "</Directory>" >> /etc/apache2/apache2.conf
RUN mkdir /workspaces
WORKDIR /workspaces
RUN git clone https://gitlab.com/michielbdejong/cc-server
WORKDIR /workspaces/cc-server
RUN git checkout insert-my-node
RUN composer install
WORKDIR /workspaces/cc-server/vendor/credit-commons
RUN rm -rf cc-php-lib
# until https://gitlab.com/credit-commons/cc-php-lib/-/merge_requests/7 is merged:
# RUN git clone https://gitlab.com/credit-commons/cc-php-lib
RUN git clone https://gitlab.com/michielbdejong/cc-php-lib
WORKDIR /workspaces/cc-server/vendor/credit-commons/cc-php-lib
RUN git checkout 0.9.x
RUN composer install

WORKDIR /workspaces/cc-server/vendor/credit-commons
RUN rm -rf cc-node
RUN git clone https://gitlab.com/credit-commons/cc-node
WORKDIR /workspaces/cc-server/vendor/credit-commons/cc-node
RUN git checkout 0.9.x
RUN composer install

WORKDIR /workspaces/cc-server/vendor/credit-commons/cc-node/vendor/credit-commons
RUN rm -rf cc-php-lib
RUN ln -s /workspaces/cc-server/vendor/credit-commons/cc-php-lib

WORKDIR /workspaces/cc-server
RUN wget -qO- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.2/install.sh | bash
RUN git clone https://github.com/michielbdejong/automerge-basic
WORKDIR /workspaces/cc-server/automerge-basic
RUN git checkout cc-server-experiment
RUN /bin/bash -c 'source ~/.bashrc ; nvm install 22'
RUN /bin/bash -c 'source ~/.bashrc ; npm install'
RUN /bin/bash -c 'source ~/.bashrc ; npm run build'
WORKDIR /workspaces/cc-server
RUN sed -i '3 a require_once __DIR__ . "/../vendor/autoload.php";' vendor/credit-commons/cc-node/src/functions.php
WORKDIR /var/www
RUN rm -rf html
RUN ln -s /workspaces/cc-server html
WORKDIR /var/www/html
RUN sed -i 's/pathprefix/pathPrefix/' vendor/credit-commons/cc-php-lib/src/Requester.php
COPY cc.yml configs/cc.yml
COPY init.sql init.sql
# This will create the credcom_twig database:
RUN service mariadb start && vendor/bin/phpunit tests/SingleNodeTest.php
RUN service mariadb start && cat init.sql | mysql credcom_twig
EXPOSE 80