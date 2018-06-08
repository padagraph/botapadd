
sudo apt update --assume-yes
sudo apt upgrade --assume-yes
sudo apt install gunicorn python-igraph python-pip nginx git xz-utils python-wheel python-future python-numpy python-scipy python-sklearn certbot --assume-yes

sudo adduser botapad --gecos "" --disabled-password 

sudo su botapad -c "cd /home/botapad;
git clone https://github.com/padagraph/botapadd.git;

cd botapadd ;
pip install -r requirements-prod.txt;
pip install https://github.com/padagraph/botapi/archive/master.zip --no-deps"

sudo adduser foldr --gecos "" --disabled-password

sudo su foldr -c " cd /home/foldr;
wget https://nodejs.org/dist/v6.11.3/node-v6.11.3-linux-x64.tar.xz ;
tar -xf node-v6.11.3-linux-x64.tar.xz ;
export PATH=$PATH:/home/foldr/node-v6.11.3-linux-x64/bin ;
git clone https://github.com/padagraph/hackfoldr-2.0-forkme.git ;
cd hackfoldr-2.0-forkme ;
npm i;
./node_modules/gulp/bin/gulp.js build
"

sudo cp botapad.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable botapad
sudo service botapad start

sudo cp nginx/* /etc/nginx/sites-enabled/
sudo service nginx stop
certbot certonly --standalone -d botapad.padagraph.io
sudo service nginx restart
