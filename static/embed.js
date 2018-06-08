
define([
  // These are path alias that we configured in our main.js
    //'jquery',
    'underscore',
    'backbone',
    'mousetrap',
    'cello',
    'gviz',
    'materials',
    'moment',
	'numeric',
    'pdgconst'
], function( _, Backbone, Mousetrap, Cello, Gviz, Materials, moment, Numeric, Const){

    /* DEBUG: this un activate the console */
    var DEBUG = true;

    Cello.DEBUG = DEBUG;

    if(!DEBUG){
        console.log = function() {}
    }

    
;var Models = {}

Models.User = Backbone.Model.extend({
    
        defaults: {
            username: "",
            logged: false,
            login_url : '../account/login',
            logout_url : '../account/logout',
        },

        login: function(data) {
            var self = this;
            $.ajax({
              url: this.get('login_url'),
              type:"POST",
              data:JSON.stringify(data),
              contentType:"application/json; charset=utf-8",
              dataType:"json",
              success: function(data) {
                  console.log( "success", data);
                  self.set(data); // data should be in JSON and contain model of this user
                  if ( data.logged && data.username != "" ){
                      Backbone.trigger('user:logged_in', self.attributes); // our custom event
                      console.log( "triggered", self.attributes);
                  }
              },
              error:function(){
                  self.trigger('user:loginError'); // our custom event
              }
            });
        },
        
        logout: function(){
            var self = this;

            $.ajax({
              url: this.get('logout_url'),
              type:"POST",
              data: JSON.stringify({}),
              contentType:"application/json; charset=utf-8",
              dataType:"json",
              success: function(data) {
                  self.set(data); // data should be in JSON and contain model of this user
                  Backbone.trigger('user:logged_out', self.attributes); // our custom event
                  console.log( "triggered", 'user:logged_out', self.attributes);
              },
              error: function(){
                  self.trigger('user:logoutError'); // our custom event
              }
            });
            
        }
});

Models.Cluster = Cello.Cluster.extend({
    
    initialize : function(attrs, options){
        var _this = this;
        Models.Cluster.__super__.initialize.apply(this, arguments);
        
         //this.on('add remove reset', function(){
             //_this.each(function(model){
                 //model._compute_membership();
                 //model._compute_colors();
             //})
         //});
        
        this.on("change:color", function(){
            _this.members.vs.each( function(vertex){
                vertex.set('cl_color',_this.color);
            });
        });
    },
    
    _unselect : function(){
            // remove flag cluster on the vertices of the current cluster
        this.members.vs.each( function(vertex){
                vertex.remove_flag('cluster');
        });
        
        // remove faded flag on the vertices of all other clusters
        var other_clusters = this.collection.without(this);

        _(other_clusters).each(function(clust){
            clust.members.vs.each( function(vertex){
                vertex.remove_flag('cluster-faded');
            _.each(vertex.incident(), function(edge){
                    edge.remove_flag('es-cluster-faded');
                });
            });
        });

    }
});




Models.Vertex = Cello.Vertex.extend({

    classname : "Models.Vertex",

    defaults: {
         uuid : null,
         nodetype : null,
         properties : new Backbone.Model(),
         cl_color : [0, 0, 0],
         color: [0,0,0]
    },

    url : function() {
        return this.graph.url() + "/node" + (this.id ? ("/"+ this.id ) : "");
    },

    star  : function() { this.set_starred(true)  },
    
    unstar: function() { this.set_starred(false) },
    
    set_starred: function(star){
        
        var url = this.url() + ( star ? "/star" : "/unstar" )  ;
            
        $.ajax({
          url: url,
          type:"POST",
          data:JSON.stringify({
                  start:0
              }),
          contentType:"application/json; charset=utf-8",
          dataType:"json",
          success: function(data){},
          error: function(){}
        });

        
    },

    format_label : function(length){
         // css should be in materials
        var font = ".form"
        var label = this.label
        if (length) {
            label = label.substring(0,length)
        }
        return [ {form : label, css : font} ];
    },

    to_str : function(){
        return  this.label;
    },

    validate: function(attrs, options) {
        var errors = []
        //- missing field name
        if ( !attrs.nodetype)
            errors.push( {
                     field : "nodetype",
                     header : "Nodetype",
                     message: "a nodetype is required"
                   });
        if ( ! Object.keys(attrs.properties.attributes).length )
            errors.push( {
                     field : "properties",
                     header : "Properties",
                     message: "a node should have a property"
                   });

        if (errors.length) {
            return errors
        }
    },

    parse: function(data, options){
        if (data.properties)
            data.properties = new Backbone.Model(data.properties, {parse:true})
        return data;
        
    },

    get_properties: function() {
        // TODO Parse Node_type
        var _this = this;
        var props = {};
        this.nodetype.get('properties').each( function(prop) {
            var k = prop.get('name');
            if ( k != 'uuid' )
                props[k] = _this.properties.get(k);
        }); 
        return props;
    },

    fetch_neighbors: function(mode, success){

        var self = this;
        var url_root = this.url() ;

        if (this._neighbors) {
            success(this._neighbors);
            return;
        }

        $.ajax({
          url: url_root + "/neighbors",
          type:"POST",
          data:JSON.stringify({
                  start:0,
                  mode: this.mode
              }),
          contentType:"application/json; charset=utf-8",
          dataType:"json",
          success: function(data){

            var es = {};
            if ( data.neighbors ) {
                for ( var i in data.neighbors ){
                    var neighbor = data.neighbors[i]
                    var eid = neighbor[0].uuid;
                    es[eid] = neighbor
                }
                var vs = [];
                for ( var k in es )
                    vs.push(es[k])
                self._neighbors =  vs ; 
            }
            
            success(self._neighbors);    
          }
        })

    },

    toCard: function(){
        return {
                    uuid : this.id,
                    label : this.label,
                    nodetype : this.nodetype.get('name')
                }
        
    },

    // persistence post data
    toJSON: function(options){
        // TODO return keys from node_type
        return {
                uuid: this.get('uuid'),
                nodetype : this.get('nodetype'),
                properties: this.get_properties()
             }
    },

    
},{ // !! static not in the same brackets !!
    active_flags : ['intersected', 'faded', 'selected']
});

Models.EdgeType = Cello.EdgeType.extend({

    parse_label: function(){

            var label = this.label;
            
            var token = label.substring(label.indexOf('/') + 1);
            
            var e = {};
            e.label =  label;
            e.family = label.indexOf('/') >= 0 ? label.substring(0,label.indexOf('/')) : "";
            e.name = label.indexOf('/') > 0  ? label.substring(label.indexOf('/')) : label;
            e.subscript = "";
            //e.cdata = this.get('type_attributes')['cdata'];
            return e;
        }

    });



Models.Edge = Cello.Edge.extend({

    url : function(){
        return this.graph.url() + "/edge" + (this.id ? ("/"+ this.id ) : "");
    },
    

    get_properties: function() {
        // TODO Parse Node_type
        var _this = this;
        var props = {};
        this.edgetype.get('properties').each( function(prop) {
            var k = prop.get('name');
            if ( k != 'uuid' )
                props[k] = _this.properties.get(k);
        }); 
        return props;
    },

    validate: function(attrs, options) {
        var errors = []
        //- missing field name
        if (!attrs.source)
            errors.push( {
                     field : "source",
                     header : "Source",
                     message: "a source is required"
                   });
        if (!attrs.target)
            errors.push( {
                     field : "target",
                     header : "Target",
                     message: "a target is required"
                   });
        if (!attrs.edgetype)
            errors.push( {
                     field : "edgetype",
                     header : "Edgetype",
                     message: "a edgetype is required"
                   });

        if (errors.length) {
            return errors
        }
    },

    parse: function(data, options){
        if (data.properties)
            data.properties = new Backbone.Model(data.properties, {parse:true})
        return data
        
    },

    // persistence post data
    toJSON: function(options){
        // TODO return keys from node_type
        return {
            'uuid': this.id,
            'edgetype': this.edgetype.id,
            'source': this.get('source') ,
            'target': this.get('target') ,
            'properties': this.get_properties()
            }
    },

    
},{ // !! static not in the same brackets !!
    active_flags : ['intersected', 'faded', 'selected']
});



Models.UuidEdgeListQuery = Backbone.Model.extend({
    defaults : {
        graph : null,
    },
    
    export_for_engine: function(){
        var edgelist = _.map( this.get('graph').es.models, function(e){ return e.get('uuid') } );
        return { format: 'uuid_edgelist',
                 graph: this.get('graph').get('gid'),
                 edgelist: edgelist
               };
    },

});

Models.IndexEdgeListQuery = Backbone.Model.extend({
    defaults : {
        graph : null,
    },
    
    export_for_engine: function(){
        var graph = this.get('graph');
        
        var nodelist = _.chain( graph.vs.models)
                        .filter(function(e){ return e.has_flag('disabled') == false } )
                        .map(function(e){ return e.get('uuid') } )
                        .value();
                        
        var nodeidx = _.chain( nodelist )
                        .map(function(e, i){ return [e, i] } )
                        .object()
                        .value();

        var edgelist = _.chain( graph.es.models)
                        .filter(function(e){ return e.has_flag('disabled') == false } )
                        .map(function(e, i){ return [nodeidx[e.source.id], nodeidx[e.target.id]] } )
                        .value();

        var weights  = _.chain( graph.es.models)
                        .filter(function(e){ return e.has_flag('disabled') == false } )
                        .map(function(e, i){ var v = e.properties.get('weight', 1.); return v ? parseFloat(v) : 1. } )
                        .value();
                        
        //var edgelist = _.map( graph.es.models, function(e){ return e.get('uuid') } );
        return { format: 'index_edgelist',
                 graph: this.get('graph').get('gid'),
                 nodelist: nodelist,
                 edgelist: edgelist,
                 weights: weights,
                 directed: true
               };
    },

});

Models.ExpandNodesQuery = Backbone.Model.extend({
    defaults : {
        graph : null,
        nodes: [], // uuids
        expand: [], // uuids
        weights: [],
    },
    
    export_for_engine: function(){
        var nodes = _.map( this.get('graph').vs.models, function(e){ return e.get('uuid') } );
        return { graph: this.get('graph').get('gid'),
                 nodes: nodes,
                 expand: this.get('expand'),
                 weights: this.get('weights'),
               };
    },

});

Models.ClustersLabelsQuery = Backbone.Model.extend({
    defaults : {
        graph : null,
        clustering: [], // clustering model
    },
    
    export_for_engine: function(){
        var model = this.get('clustering')
        var cls = model.clusters.models;
        var clusters = cls.map( function(e){
            var uuids = e.members.vs.models.map(function(v){ return v.id });
            return uuids;
        });
        
        return { graph: this.get('graph').get('gid'),
                 clusters: clusters,
               };
    },

});

Models.AdditiveNodesQuery = Backbone.Model.extend({
    defaults : {
        graph : null,
        uuids : [],
    },
    
    export_for_engine: function(){
        var nodes = _.map( this.get('graph').vs.models, function(e){ return e.get('uuid') } );
        return { graph: this.get('graph').get('gid'),
                 nodes: nodes,
                 add  : this.get('uuids')
               };
    },

});


Models.QueryUnit = Backbone.Model.extend({


        defaults: {
            query: "",
            // surface attr
            valid: false,
        },

        initialize: function(models, options){
            this.on("change", this.validate);
        },

        /* Set the Query unit from a raw string */
        set_from_str: function(query){
            this.set("query", query);
        },

        to_string: function(){
            return this.get("query");
        },

        toJSON: function (){
            return  { query: this.get('query') }
        },

        /* Ajax call to check if this query unit exist (and so is valid)
        */
        validate: function() {
            //TODO
        },
    });

    
;


QueryUnits = Backbone.Collection.extend({
        model: Models.QueryUnit,
        graph: "",

        reset_from_models: function(models){
            if ( _.isArray(models) === false  ){
                models = [models]
            }
            
            var data = [];
            var Model = this.model;
            _.each(models, function(model){
                attrs = _.pick(model, 'query')
                var query_elem = new Model(attrs);
                data.push(query_elem);
            });
            this.reset(data);
            
        },

        /* Reset the QueryUnit collection from a raw string */
        reset_from_str: function(query_str){
            console.log("query : " + query_str);
            var Model = this.model;
            var data = [];
            var qsplit = query_str.split(",");
            _.each(qsplit, function(qstr){
                var query_elem = new Model();
                query_elem.set_from_str(qstr);
                data.push(query_elem);
            });
            this.reset(data);
        },

        reset_random: function(){
        /* reset collection with a random node
         * */
            var _this = this;
            var Model = this.model;
            $.ajax({
                    url:this.random_url,
                    dataType:"json",
                    success : function(data){
                        var unit = new Model(data);
                        _this.reset_from_models([unit]);
                    }
                });
        },


        to_string: function(){
            return this.models.map(function(qunit){ return qunit.to_string() }).join("; ");
        },

        validate: function(){
            return this.length > 0
        },

        export_for_engine: function(){
            return { graph: this.graph, units: this.toJSON()};
        },
    });;// keyboard short cuts


var ShortcutsHelp = []

var GvizShortcuts = function(gviz){ return [
        "* Labels ",
        [
            'l', "toggles node/edge label display", function(){
                gviz.show_text = ! gviz.show_text
                gviz.renderer.DISPLAY_EDGE_LABEL = !gviz.renderer.DISPLAY_EDGE_LABEL;
                gviz.request_animation();
            }
        ],
        [
            '+', "increase vertex size", function(){
                gviz.increase_vertex_size();
            }
        ],
        [
            '-', "decrease vertex size", function(){
                gviz.decrease_vertex_size();
            }
        ],
        [
            ',', "increase font label size", function(){
                gviz.user_font_size = Math.min(25, gviz.user_font_size + 1 );
                gviz.request_animation();
            }
        ],
        [
            ';', "decrease font label size", function(){
                gviz.user_font_size = Math.max(-5, gviz.user_font_size - 1 );
                gviz.request_animation();
            }
        ],

        "* Nodes/edges " ,
        [
            'n', "toggle node display", function(){
                gviz.show_nodes = ! gviz.show_nodes ;
                gviz.request_animation();
            },
        ],
        [
            'e', "toggle edge display", function(){
                gviz.show_edges = ! gviz.show_edges ;
                gviz.request_animation();
            },
        ],
        [
            'i', "toggle node image display", function(){
                gviz.show_images = ! gviz.show_images ;
                gviz.request_animation();
                console.log("toggle image display", gviz.show_images)
            }
        ],
       
        "* Rendering ",
        [
            'r', "toggles autorotate", function(){
              gviz.controls.AUTO_ROTATE = !gviz.controls.AUTO_ROTATE;
              gviz.request_animation();
            }
        ],
        [
            'd', "increases autorotate speed", function(){
                gviz.controls.autoRotateSpeed = gviz.controls.autoRotateSpeed  * 1.5;
            }
        ],
        [
            's', "decreases autorotate speed", function(){
                gviz.controls.autoRotateSpeed = gviz.controls.autoRotateSpeed  / 1.5;
            }
        ],
        [
            'e', "toggle end arrow display", function(){
                gviz.renderer.DISPLAY_EDGE = ! gviz.renderer.DISPLAY_EDGE; 
                gviz.request_animation();
            }
        ],
        [
            'a', "toggle init arrows display", function(){
                gviz.DISPLAY_ARROW_END = !gviz.DISPLAY_ARROW_END;
                gviz.DISPLAY_ARROW_INIT = !gviz.DISPLAY_ARROW_INIT;
                gviz.request_animation();
            }
        ],
        [
            'f', "toggle fog display", function(){
                gviz.ENABLE_FOG = ! gviz.ENABLE_FOG;
                gviz.request_animation();
            }
        ],
        [
            'w', "toggle coords transition", function(){
                gviz.changeCoordSpeed = (gviz.changeCoordSpeed > 10)? 10 : 500;
            }
        ],
    ]};

function bindAllKeyboardShortcuts(context, actions, prefix){
    if (prefix && prefix.length)
        prefix = prefix + " ";
    else
        prefix = "";
        
    _.each( actions, function(e){
        if (_.isString(e) )
            ShortcutsHelp.push("\n" + e);
        else {
            var key = prefix + e[0];
            bindKey( key, e[1], e[2], context )
        }
    } );
};

function bindKey( keyseq, help, callback, context){
    context = context === undefined ? document : context;
    Mousetrap().bind( keyseq, callback )
    ShortcutsHelp.push( "'" + keyseq + "' : " + help );
        
};


function install_edit_shortcuts(context, graph, prefix){
    var actions  = [
        "# Graph edition", 
        [
            'e', "edits selected node", function(){
                var vs = graph.vs.by_flag('selected');
                if( vs.length == 1)
                {
                    Backbone.trigger('edit:node', vs[0]);
                }
            }
        ],
    ];
    bindAllKeyboardShortcuts(context, actions, prefix);
}

function install_navigation_shortcuts(context, graph, prefix){
    var actions  = [
        [
            'enter', "Expands node relations",function(){
                var vs = graph.vs.by_flag('selected');
                if( vs.length == 1)
                {
                    var params = { graph: graph.id, expand: [vs[0].id], weights:[] };
                    Backbone.trigger('engine:expand_prox', params);
                }
            }
        ],
        [   'shift+enter', "Explore", function(){
                var vs = graph.vs.by_flag('selected');
                if( vs.length == 1)
                {
                    var params = { graph: graph.id, query: vs[0].id };
                    Backbone.trigger('engine:explore', params);
                }
            }
        ],
        [
            'backspace', "Removes node from view", function(){
                var vs = graph.vs.by_flag('selected');
                if( vs.length == 1)
                {
                    Backbone.trigger(Const.remove_node, vs[0] );
                }
            }
        ]
    ];
    
    bindAllKeyboardShortcuts(context, actions, prefix);
}



function install_gviz_shortcuts(gviz, prefix){

    //- global no prefix
    bindAllKeyboardShortcuts( gviz.$el, GvizShortcuts(gviz) , prefix);

    
};
    
function install_shortcuts(){
    // display help
    bindKey( 'h', "Displays help", function(){
            var help= ShortcutsHelp.join('\n');
            //to do find other way to display help
            console.log(help);
    });
};var Utils = {

    rotate_graph : function(P, Q) {
        // R rotation matrix computation

        // using Kabsch_algorithm https://en.wikipedia.org/wiki/Kabsch_algorithm
        // and numeric.js v1.2.6 http://www.numericjs.com/
        try {
            var A = numeric.dot(numeric.transpose(P), Q); // covariance matrix

            var SVD = numeric.svd(A); // SVD
            var Vt = numeric.transpose(SVD["U"]);
            var W = SVD["V"];

            var det = numeric.det(numeric.dot(W,Vt));
            var d = (det != 0) * (1 - 2 * (det<0) );
            d = 1;
            var M = [[1, 0, 0], [0, 1, 0], [0, 0, d]];


            var R = numeric.dot(numeric.dot(W, M), Vt); // Rotation matrix

            var Q_new = numeric.dot(Q, R); // new position

            // check error evolution
            var err_init = numeric.norm2(numeric.sub(P, Q));
            var err_finale = numeric.norm2(numeric.sub(P, Q_new));
            // console.log("rotation  : err init : ", err_init, ", err finale : ", err_finale);

            return Q_new;
        }
        catch (e) {
            // probably no convergence
            console.log("rotate_graph", e);
            return Q;
        }
    },
};
;
function arrayMax(arr) {
    return arr.reduce(function (p, v) {
        return ( p > v ? p : v );
    });
}

function arrayMin(arr) {
    return arr.reduce(function (p, v) {
        return ( p < v ? p : v );
    });
}

function rm_model_image(model){
    if (model.id)
        $("#img" + model.id).remove();
}

function add_model_image(model){
    if (model.id && model.properties.get('image')){
        var imgurl = model.properties.get('image');
        if ( imgurl.substring(imgurl.length - 3) == "svg" )
        {
            $.ajax({ url:imgurl,  dataType: 'text', success:function(svg){
                var img = new Image();
                img.onload = function() {
                    var canvas = document.getElementById("gviz_imgs_cache_canvas");
                    canvas.width = 400;
                    canvas.height = 400;
                    canvas.getContext("2d").drawImage(img,0,0,400,400);
                    imgurl = canvas.toDataURL('image/png');
                    
                    $('#gviz_model_imgs').append( "<img id='img" + model.id +"' src='"+ imgurl +"'/>" );
                };
                
                img.src = "data:image/svg+xml;charset=utf-8," + svg

            }} );
            
        }
        else {
            $('#gviz_model_imgs').append( "<img id='img" + model.id +"' src='"+ imgurl +"'/>" );
        }
    }
}

function change_model_image(model){
    if (model.id && model.properties) {

        if (model.properties.changed && model.properties.changed.image) {
            rm_model_image(model);
            add_model_image(model);
        }
        
    }
}


function apply_layout(graph, response){
    
    var vs = graph.vs;
    
    if ( !vs.length ) return;
    
    if ( !response | !('results' in response)  | !('layout' in response.results))
        return;

    var coords = response.results.layout.coords;

    // put coords in matrix
    var P = []; // last coords
    var Q = []; // new coords
    var D = {}; // indices dict
    var j=0;

    for (var i in coords)
    {
        var c = coords[i];
        c.push(0);
        Q.push(c.slice(0,3));
        if(vs.get(i).get("coords"))
            P.push( vs.get(i).get("coords").slice(0,3) );
        else
            P.push(c.slice(0,3));
        D[i]=j;
        j++;
    }

    Q_new = Utils.rotate_graph(P, Q);

    for (var i in coords){
        var vtx = vs.get(i);
        vtx.set("coords", Q_new[D[i]]);
    }

    // computes node size [0,1]
    var neigh = vs.map(function(vtx){
        return vtx.degree();
    });
    
    var mx = arrayMax(neigh);
    var mn = arrayMin(neigh);

    vs.each(function(vtx){
        var nei = vtx.degree();
        vtx.set('_size', mx > mn ? (nei-mn) / (mx-mn) : 1) ;
    });
    
}

var App = {}
App.Models = Models;
App.Base = Backbone.View.extend({

    // DEBUG
    DEBUG: false, // should be false by default else initialize can't change it

    initialize: function(options){
        
        this.DEBUG = options.debug || this.DEBUG;
        //window._app =  this;
        
        this.root_url = options.root_url || "/";

        // engines routes

        var _url = function(e){
            if (e)
                if (_.isString(e))
                    return { 'url':e } ;
                if ('url' in e)
                    return e;
            return null;
        } 

        this.routes ={};
        for (k in options.routes)
            this.routes[k] = _url(options.routes[k])
        
        // search completions
        this.complete_url = this.routes.complete_url;
        // login / logout
        this.login_url = options.login_url;
        this.logout_url = options.logout_url;
        //TODO
        this.random_url = options.random_url;


        this.fullscreen = false;
        this.$el = options.$el === undefined ? document : options.$el ; 
        
        this.ALLOW_AUTO_COMPUTE = true;
        this._auto_compute_delay = false

        this.Models = Models;
        this.models  = _.clone({});
        this.engines = _.clone({});
    },
    
    create_user_model: function(){
        // --- user model ---
        var app = this;
        var usermodel = new Models.User();
        usermodel.listenTo(Backbone, "user:logout",  usermodel.logout);
        usermodel.listenTo(Backbone, "user:login", usermodel.login);
        app.models.user = usermodel;

    },
    
    create_query_model: function(){
        // --- Query model ---
        var app = this;        
        app.models.query = new QueryUnits([], {});
    },

    create_graph_model: function(attrs){
        // --- Graph model ---
        var app = this;

        attrs = _.extend( {
            vertex_model: Models.Vertex,
            edge_model: Models.Edge,
            edgetype_model: Models.EdgeType,
            
        }, attrs ? attrs : {} )
        var graph = new Cello.Graph(attrs);

        app.models.graph = graph;
        
        app.listenTo(graph.es, 'remove', _.bind(app.auto_compute, app) );
        
        app.listenTo(graph.vs, 'add', app.auto_compute, app );
        app.listenTo(graph.vs, 'add', add_model_image );
        app.listenTo(graph.vs, 'change', change_model_image );
        app.listenTo(graph.vs, 'remove',  function(node)  {
            rm_model_image(node);
            graph.vs.set_selected([]);
            
        });

        //app.listenTo(graph.vs, 'reset', app.auto_compute, app );


        // --- edge/vertex events ---
        app.listenTo(Backbone, Const.unselect_nodes, function(){
            graph.vs.set_selected([]);
        });
        
        app.listenTo(Backbone, Const.unselect_edges, function(){
            graph.es.set_selected([]);
        });

                    
        app.listenTo(Backbone,Const.select_node, function(vtx){
    
            if (  vtx.id &&  graph.vs.get(vtx.id) ) {
                Backbone.trigger(Const.unselect_nodes);
                Backbone.trigger( Const.unselect_edges);
                graph.vs.set_selected(vtx);
            }
        });

        app.listenTo(Backbone, Const.select_edge, function(edge, event){
            Backbone.trigger(Const.unselect_nodes);
            Backbone.trigger(Const.unselect_edges);
        });
        
        app.listenTo( Backbone, Const.remove_all, function(){
            app.set_auto_compute(false);
            graph.vs.set([]);
            graph.es.set([]);
            app.set_auto_compute(true);
        });

        app.listenTo( Backbone, Const.remove_node, function(vertex){
            app.set_auto_compute(false);
            if( vertex ){
                graph.vs.set_selected([]);
                graph.vs.remove(vertex);
            }
            app.set_auto_compute(true);
            app.trigger('engine:auto_compute', app.models.graph);
        });

        app.listenTo( Backbone, Const.remove_edge, function(edge){
            app.set_auto_compute(false);
            if( edge ){
                graph.es.set_selected([]);
                graph.es.remove(edge);
            }
            app.set_auto_compute(true);
            app.trigger('engine:auto_compute', app.models.graph);
        });

        // --- Binding the app ---
        this.listenTo( Backbone, 'request-graph-clear', function(name){
            Backbone.trigger(Const.unselect_nodes);
            Backbone.trigger(Const.unselect_edges);
            app.set_auto_compute(false);
            graph.vs.set([]);
            app.set_auto_compute(true);
        });
    },

    create_clustering_model: function(){

        // --- Clustering model ---
        var app = this;
        
        app.models.clustering = new Cello.Clustering({
            ClusterModel: Models.Cluster,
            color_saturation:71,
            color_value: 80,
        });

    },

    
    create_engines: function(){
        // --- Engines ---
        var app = this;
        var routes = app.routes;
        
        var Engine = function(options){
                var engine = new  Cello.Engine(options)
                app.listenTo(engine, 'play:loading', function(){ Backbone.trigger("play:loading", engine) });
                app.listenTo(engine, 'play:error', function(){ Backbone.trigger("play:complete", engine) });
                app.listenTo(engine, 'play:success', function(){ Backbone.trigger("play:complete", engine) });
                return engine
        }

        // Explore prox engine
        if ( routes.explore ){
            var explore = Engine({url: routes.explore.url});
            explore.register_input("request", app.models.query);
            
            app.listenTo( Backbone,"engine:explore", function(params){
                app.models.query.reset_from_models(params)
                explore.play();
            });
            app.listenTo(explore, 'play:success', app.explore_reset);
            
            app.engines.explore = explore;
        
        }
        
        // Starred  engine
        if ( routes.starred ){

            var starred = Engine({url: routes.starred.url});
            starred.register_input("request", app.models.query);
            app.listenTo( Backbone, "engine:starred", function(params){
                app.models.query.reset_from_models(params)
                starred.play();
            });
            app.listenTo(starred, 'play:success', app.explore_reset);
            app.engines.starred = starred;
        }
        
        // Additive node engine
        if ( routes.additive_nodes ){

            var additiveNodeQuery = new Models.AdditiveNodesQuery({graph: app.models.graph })
            app.engines.additive_nodes = Engine({url: routes.additive_nodes.url});
            app.engines.additive_nodes.register_input("request", additiveNodeQuery);

            app.listenTo(Backbone, 'engine:additive_nodes', app.additive_nodes );
            
            app.listenTo(app.engines.additive_nodes, 'play:success', app.merge_graph );

        }

        // prox expand

        if ( routes.expand_px ){

            var expand_query =  new Models.ExpandNodesQuery({graph: app.models.graph});
            app.engines.expand_prox = Engine({url: routes.expand_px.url});
            app.engines.expand_prox.register_input("request", expand_query);
            app.listenTo(Backbone, 'engine:expand_prox', function(data){
                console.log('engine:expand_prox', data);
                expand_query.set('expand', data.expand);
                expand_query.set('weights', data.weights);
                app.engines.expand_prox.play();
            });
            app.listenTo(app.engines.expand_prox, 'play:success',app.expand_graph);
    
        }

        // Layout computation engine
        if ( routes.layout){

            var layout = Engine({url: routes.layout.url});

            layout.register_input("request", new Models.IndexEdgeListQuery({graph: app.models.graph }));

            app.on('engine:layout', function(name){
                
                if ( !layout.blocks.length) return;

                console.log('engine:layout', name);
                var comps = layout.blocks.at(0).components;
                comps.each( function(e){ e.set('selected', false) } );

                var comp = comps.get(name);
                if (! comp) comp = comps.at(0);
                comp.set('selected', true);

                layout.play();
            });

            var graph = app.models.graph;
            
            var _apply_layout = function( app, graph, response ) {
                apply_layout( graph, response )
                app._additive_nodes_delayed = false;                
                Backbone.trigger('engine:request_animation');
            }
            
            app.listenTo(layout, 'play:success', _.partial(_apply_layout, app, app.models.graph) );
            app.engines.layout = layout;

        }


        // Clustering engine
        if ( routes.clustering){
            
            var clustering = Engine({url: routes.clustering.url});
            clustering.register_input("request", new Models.IndexEdgeListQuery({graph: app.models.graph }));
            app.on('engine:clustering', function(name){ 
                console.log('engine:clustering', name);
                var blocks = clustering.blocks
                if ( !blocks.length) return;
                var comps = blocks.at(0).components;
                comps.each( function(e){ e.set('selected', false) } );
                
                var comp = comps.get(name);
                if (! comp) comp = comps.at(0);
                comp.set('selected', true);

                clustering.play();
            });
        
            app.listenTo(clustering, 'play:success', app.apply_clustering);
            app.engines.clustering = clustering;
        }

        // extra routes
        for (var k in routes){
            if (app.engines[k]) continue;
            var e = Engine({url: routes[k].url});
            app.engines[k] = e;
        }

        //when engine failed
        app.listenTo(Backbone, 'play:error', app.engine_play_error);
        app.on('engine:auto_compute', app.auto_compute);
        
    },

    fetch_engines: function(complete){
        
        /** === Fetching engines options === */

        var app = this;

        var pending = {
            'complete' : complete,
            'count' : _.size(app.engines)
            };

        var engine_fetched = function(engine){
            pending.count -=1;
            console.log(' engine_fetched ', pending.count )
            //pending[]
            if( pending.count == 0 ) {
                
                if ( pending.complete ) pending.complete(app);
                else {
                    var event = new Event("app_engines_fetched", {"bubbles":true, "cancelable":false});
                    document.dispatchEvent(event);
                }
            };
        };

        
        if (app.engines.layout )
          app.engines.layout.fetch({ success: function(context, engine, resp, options){
            if ( ! _.size(engine.blocks) ) return;  
            var block = engine.blocks.at(0);
            var models = block.components.models;
            var layouts = []
            var shortcuts = ["# Layouts"]
            var i = 0;

            for ( var k in models ){
                i++;
                var key = "" + i;
                var name = models[k].id + "|";
                name = name.substring(0, name.indexOf("|"));
                var value = "" + models[k].id;
                var f = function( v ){
                    return function(){ app.trigger('engine:layout', v );}
                }
                shortcuts.push( [key , name, f(value)])
                layouts.push(  {name : name, value: value, model: models[k]  } )
            }
            
            bindAllKeyboardShortcuts( this.$el, shortcuts, "!" );
            app.setLayouts(layouts);
            engine_fetched();
            
          }});

        if (app.engines.clustering)
          app.engines.clustering.fetch({ success: function(context, engine, resp, options){
            if ( ! _.size(engine.blocks) ) return;
            var block = engine.blocks.at(0);
            var models = block.components.models;
            var clusterings = []
            var shortcuts = ["# Community detection"]
            var i = 0;

            for ( var k in models ){
                i++;
                var key = "" + i;
                var name = models[k].id + "|";
                name = name.substring(0, name.indexOf("|"));
                var value = models[k].id;
                var f = function( v ){
                    return function(){ app.trigger('engine:clustering', v );}
                }
                shortcuts.push( [key , name, f(value)])
                clusterings.push(  {name : name, value: value, model: models[k]  } )
            }
            
            bindAllKeyboardShortcuts(this.$el, shortcuts, ":" );
            app.setClusterings(clusterings);
            engine_fetched();
            
        }});


        for ( var k in app.engines){
            console.log(" FETCH ENGINES "+ k);
            if ( k == "clustering" || k == "layout"  ) continue;
            app.engines[k].fetch({ success: engine_fetched });
            
        }
              
    },

/* engines callbalcks */

     auto_compute: function(){
            
        if (!this.ALLOW_AUTO_COMPUTE || this._auto_compute_delay ) return;
        var graph  = this.models.graph;
        if ( !graph || !graph.vs || !graph.vs.length  ) return;

        //this.trigger('engine:layout')
        //this.trigger('engine:clustering')
        
        if(this.engines.clustering) this.engines.clustering.play();
        if(this.engines.layout) this.engines.layout.play();
    },

    noop: function(){},

    additive_nodes: function(uuids, options){
        this._additive_nodes_uuids = _.union(this._additive_nodes_uuids , uuids)

        if (!this._additive_nodes_delay){            
            this._additive_nodes_delayed = true;
                    
            var engine = this.engines.additive_nodes
            console.log('engine:additive_nodes', this._additive_nodes_uuids, options);
          
            engine.input_models['request'].set('uuids', this._additive_nodes_uuids);
            engine.play(options);
            this._additive_nodes_uuids = []
                    
        }
    },

    explore_reset: function(response){
        Backbone.trigger(Const.unselect_nodes);
        Backbone.trigger(Const.unselect_edges);
        
        var app = this;
        app.response = response;

        console.log('explore_reset', response.results)
        app.set_auto_compute( false );

        // parse and reset graph
        if (response.results.graph){
            app.models.graph.reset(response.results.graph);
            app.models.graph.set("gid", response.results.graph.properties.name )

            app.models.graph.vs.each(function(vtx){
                vtx.add_flag("form");
            });
        }

        // auto ask for layout & clustering
        app.set_auto_compute( true );
        app.auto_compute();
        
    },

    expand_graph: function(response){
        // gets 10 first high score
        // force uuid when scores== 1.
        console.log('expand_graph', response.results)

        if ( !response | !('results' in response)  )
            return;

        var graph = this.models.graph;
        var uuids = [];
        
        var r = _.pairs(response.results.scores)
        r.sort( function(a,b){ return (a[1]<b[1]) ? 1 : -1 } )

        for ( var i in r ){
            var k = r[i][0];
            var v = r[i][1];
            
            if ( graph.vs.get(k) == null ){
                if(uuids.length >= 10 )
                    if (v < 1.)
                        break;
                        
                console.log('expand_graph adding vertex : ' + k , v)
                uuids.push(k);
            }
        } 

        if (uuids.length)
            Backbone.trigger('engine:additive_nodes', uuids);
        
    },

    clusters_labels: function(response, options){
        this.models.clustering.set_labels(response.results, options);
    },

    merge_graph: function(response, options){
                    
        if ( !response | !('results' in response)  | !('graph' in response.results))
            return;

        this.set_auto_compute( false );
        
        //Backbone.trigger( Const.unselect_nodes );
        //Backbone.trigger( Const.unselect_edges );
        //Backbone.trigger('engine:request_animation');

        options || (options = {});
        // merge/reset graph
        if (options && options.reset)
            this.models.graph.reset(response.results.graph);
        else
            this.models.graph.merge(response.results.graph);
        
        this.models.graph.vs.each(function(vtx){
            vtx.add_flag("form");
        });

        if ( options.callback )
            options.callback();

        // and compute layout & clustering
        this.set_auto_compute( true );
        this.auto_compute();
        
    },


    apply_clustering : function(response){

        if ( !response | !('results' in response)  | !('clusters' in response.results)){
            Backbone.trigger("engine:error", {
                    message: "No response or no results in response",
                    response: response
                });
            return;
        }

        this.models.clustering.reset(
            response.results.clusters,
            {
                members: {
                    vs:{
                        source: this.models.graph.vs,
                        id_field: 'vids'
                    }
                }
            }
        );
        
        this.models.clustering.clusters.each(function(cluster){
            cluster.listenTo(Backbone, "unselect_clusters", function(){cluster.remove_flag('selected')})
        });

        for (var i in this.models.clustering.clusters.models){
            var cluster = this.models.clustering.clusters.at(i);
            var members = cluster.members.vs.models;
            var si = "000" + i;
            var name =   si.substring(si.length-3) + "/" + (cluster.misc ? "0" : "1");
            _.each(members, function(e){ e.set("_sort_by_cluster", name + "/" + e.label ) } );
        }

        Backbone.trigger('engine:request_animation');

    },

   

    set_auto_compute: function(auto){
        this.ALLOW_AUTO_COMPUTE = auto;
    },

    
    
    // --- Play:Events ---

    search_loading: function(kwargs, state){
        var app = this;
        // TODO LOADING
    },

    /** when the search failed */
    engine_play_error: function(response, xhr){
        var app = this;
        console.log("play:error", 'response', response);

        $("#loading-indicator").hide(0);

        if(app.DEBUG){
            app.response = response;    // juste pour le debug
            app.xhr = xhr;
            var text;

            if(!_.isEmpty(response)){
                text = response.meta.errors.join("<br />");
            } else {
                // HTTP error, just map the anwser
                text = $(xhr.responseText);
                // HACK:
                $("body").css("margin", "0"); 
            }

            $("body").after(text);
        }

    },

    
    set_viz: function(gviz){
        var app=this;
        var graph = app.models.graph;
        this.listenTo(Backbone,Const.select_node, function(vtx){
                // center on select vertex position
                if( app.AUTO_FOCUS ){
                    var pos = _.pick(gviz.wnidx[vtx.id].position, "x", "y", "z");
                    gviz.setFocus(pos);
                }   
                gviz.request_animation();
        });

        this.listenTo(Backbone, Const.select_edge, function(edge, event){
            if (edge) graph.es.set_selected(edge);
            gviz.setFocus();
        });

        this.listenTo(graph, "change:gid", function(){
            gviz.collapse();
        });

        /** === Keyboard shortcuts === */
        install_shortcuts();
        install_gviz_shortcuts(gviz, "");
        install_navigation_shortcuts(this.$el, this.models.graph, "");
        install_edit_shortcuts(this.$el, this.models.graph, "");
        
        gviz.animate();
    },



    install_listeners: function() {
    }
    
});


App.Iframe = App.Base.extend({

    initialize : function(attrs, options){
        App.Iframe.__super__.initialize.apply(this, arguments);
    },
    
    setClusterings: function(data){
        this.clusterings = data;
    },
    setLayouts: function(data){
        this.layouts = data
    },    
});

App.Simple = App.Base.extend({

    initialize : function(attrs, options){
        App.Simple.__super__.initialize.apply(this, arguments);
    },
    
    setClusterings: function(data){
        var appmenus = $('padagraph-app-menu')[0];
        var controls = $('padagraph-controls')[0];
        appmenus.clusterings = data;
        controls.clusterings = data;
        this.clusterings = data;
    },

    setLayouts: function(data){
        var appmenus = $('padagraph-app-menu')[0];
        var controls = $('padagraph-controls')[0];
        appmenus.layouts = data;
        controls.layouts = data;
        this.layouts = data;
    },

    // create the models
    create_models: function(){
        var app = this;
        
        this.create_graph_model();
        this.create_clustering_model();
        this.create_query_model();
        this.create_user_model();
    },
    // main function
    start: function(){
        var app = this;
        var graph = app.models.graph;
        
        app.listenTo(graph, "change:gid", function(){
            $('padagraph-graph-button')[0].graphname = graph.id;
        });

        var appmenus = $('padagraph-app-menu')[0];
        appmenus.themes = Object.keys(THEMES);
        appmenus.graph = graph;
        appmenus.app = app;
        
        var controls = $('padagraph-controls')[0];
        controls.themes = Object.keys(THEMES);
        controls.app = app;
        controls.gviz = gviz;
        controls.graph = graph;
        controls.setupUI();

        var create = $('padagraph-create')[0];
        create.graph = graph;
        create.nodetype_model = graph.nodetype_model;
        create.edgetype_model = graph.edgetype_model;
        create.vertex_model = graph.vertex_model;
        create.edge_model = graph.edge_model;

        var edits = $('padagraph-edits')[0];
        edits.graph = graph;
            
        var messages = $('padagraph-messages')[0];
        messages.graph = graph;
            
        // --- webcomponents graph model ---
        $('padagraph-node-search')[0].graph = graph;
        $('padagraph-notifications')[0].setGraphModel(graph);

        //- chelou 
        $('#newNodeType').click(function(){Backbone.trigger('edit:nodetype', false)})
        
        /** === UI === */

        initUI();
        this.setFullscreen = function(bool){ this.fullscreen = bool; setFullscreen(bool)};
        this.setTheme = setTheme;

            // Create view for graph & Rendering looop
        var vizagraph = $('padagraph-gviz')[0];
        //vizagraph.setGraphModel( app.models.graph )
        var gviz = vizagraph.gviz;

        /** === Keyboard shortcuts === */
        
        app.set_viz(gviz);
        
        
        /** === Exports === */

        this.gviz = vizagraph;
        window._app = this;
        window.Cello = Cello;
        window.Models = Models;
        console.warn = function(){};
    }


});

return App
;});
