    
## Installation

    $ make install build

## Run for testing/developpment

    # this will launch a flask application listening on http://localhost:5000
    $ make rundev


# botapad

Import data in padagraph.io

    * command line
    * flask app

# Command Line

* import from file or URL
* csv like import format

## Format

We are using a csv like file format for data.  
One header is required to describe the content of the data.  
Some special characters are used at a begin line:  

*[Comments]*  
* '!' is used to comment a line, usefull for discussion and help, it will be ignored by the program

*[Separator]*  
* is defined in the first line "!," a commented comma  can also use "!;"

*[Headers]*  
* '@' Header for nodes :  
* '_' Header for edges :  

*[Properties]*  
* '*' marker for starred nodes :  
* '+' marker for multiple values in column  

* '%' marker for projection :  
* '>' and '<' edge direction , [optional] default '<'
* '=' used with '%' create a clique with all cell elements :  
* '(w)' w: float value used as edge weight
* '[v]' v: text value used as default value for a property

* '&' is an import directive to load external data  


`Headers` refers to `nodetypes` or `edgetypes` in the padagraph database.   
syntax is ```char name: prop; other``` with `char` in ( `@`,`_` )   
`:` after  Nodetype name and `;` between properties  
Properties are defined with a `Text` definition.  

### Node header

(we may extends to control over property types if needed or PR proposed)  

Creating a table for a nodetype  

    @ Person:  label ; image 

We just defined a `Person` nodetype with `properties`.

`label` is required and is the property used by padagraph to render in graphs and find nodes in the searchbox.  
`image` is used by padagraph to render nodes in graph.  

Indexed columns can be specified with an extra '#'.  

    @ Person: #num; label; image ; +roles

you will next use `num` values  to create `Relations` for shorthand and pad maintenance and uniqness.  

Next row is expecting data from this table.  
Begining and ending space will be removed in each cell.    

    *0; François Fillon; https://infographics.mediapart.fr/2017/nodes-fillon/img/nodes/0.png; candidat, premier ministre
    3; Myriam Lévy; https://infographics.mediapart.fr/2017/nodes-fillon/img/nodes/3.png
    4; Delphine Burgaud; https://infographics.mediapart.fr/2017/nodes-fillon/img/nodes/4.png
    5; Delphine Peyrat-Stricker; https://infographics.mediapart.fr/2017/nodes-fillon/img/nodes/5.png
    15; Anne Méaux; https://infographics.mediapart.fr/2017/nodes-fillon/img/nodes/15.png

Mind the node 0 , starting with `*` is `starred` .  


### Edge header

As a `nodetype`, an `edgetype` is described by properties.  
`_` is the marker used to start a set of relation of a certain type.

    _ Knows: 

and the data we use the indexed culumn `num` to identify the nodes and create links.

    0 -- 5
    0 -- 4
    15 -- 4
    15 -- 3
    
!!!! Warning you have to keep your uniq ids for the whole data !!!!   

### Projection

Sometimes you want to use a property of the row as a Node with a link to the row  
Considere a list of politicians  

    @ Politic: %Chamber; #FirstName; #LastName; %Party; %State; %Stance; Statement;

    Senator,Lisa,Murkowski,R,AK,Neutral,"All weekend long my staff and I have been monitoring ..."
    Senator,Dan,Sullivan,R,AK,Support,"Excerpt -  The temporary restrictions, which I support,  ..."

we ll get a graph with 7 nodes from 5 types  
2 'Politics', 1 'Chamber' (Senator), 1 'State' (AK) , 1 'Party' (R) , 2 'Stance' ...  
and 8 edges.  

    Politic -- Chamber  (2) 
    Politic -- State   (2)
    Politic -- Party   (2)
    Politic -- Stance  (2)

### Note :

####   mixing '%' and '+' in a prop will project row on each value of the cell  

     @ Test: #id ; %+ prop ; another
     1; a, b, c ; another
     ! this will create 3 links
     1 -- a
     1 -- b
     1 -- c
     
#### mixing '%', '+' and '=' :

'=' create a clique of the nodes means create a link between each values  

     @ Test: #id ; %+= prop ; another
     1; a, b, c ; another
     ! this will create 3 links like row -- prop
     1 -- a
     1 -- b
     1 -- c

and also 3 links  

     a -- b
     a -- c
     b -- c
 
maybe it s weird now ?
        
### Import

As the data can be collected from differents tiers,
they can also be used in a different dataset. 

    ! one set of data describe states ( code, name, image . )
    & https://mensuel.framapad.org/p/usstates/export/txt
    
    ! one to describe senators
    & https://mensuel.framapad.org/p/uspol/export/txt

    ! then add some nodes and links ..
    @ ...
    or
    _ ...


## Usage

    # see help :
    $ python botapad.py --help

    # exemple with framapad
    # edge graph
    $ python botapad.py fillon https://mensuel.framapad.org/p/qzpH0qxHkM/export/txt  --key `cat ../../key.txt` --separator ';'

    # projected graph
    $ python botapad.py uspol https://mensuel.framapad.org/p/uspol/export/txt  --key `cat ../../key.txt` --separator ','
    
## Combine

    Combine import and screenshots

    $ python ../bots/botapad.py testcsv https://mensuel.framapad.org/p/qzpH0qxHkM/export/txt --host http://localhost:5000 --key `cat ../../key.local` -v \
    && python screenshot.py testcsv fin.png  --width 600 --height 600 --zoom 1000 --no-labels --vertex-size 1 --wait 4 --host http://localhost:5000 -d chromedriver \
    && feh fillon.png


# flask app / Botapadapp

Accessible service for botapad  

### Run

#### Install deps

    $ pip install -r requirements.txt

#### Export host

    # routes: external server to compute layouts/clustering given
    $ export ENGINES_HOST=http://www.padagraph.io

#### copy your token

```get a token``` from (http://padagraph.io/account/me/generate_auth_token)  
```copy``` to ```secret/key.txt``` 

#### Run  

    $ python botapadapp.py

#### Paths

    /
    /readme
    /stats
    /import
    /import/igraph    form
    /import/padagraph form
    /static/*.js css  



[SCREENSHOT] requires ../../screenshot/screenshot.py in `$PYTHONPATH`


