
(function(root, factory) {
    // require.js
    if (typeof define === 'function' && define.amd) {
        // require.js impl
        define(['underscore','backbone'],
            function(_,Backbone) {
              return factory(root, _,Backbone);
        });
    }
    //FIXME: implements nodejs loading
    //wide scope
    else {
        root.Cello = factory(root, _,Backbone);
    }
}(this, function(root, _,Backbone) {

// == cellojs/core.js ==

    /**
     * The Cello object
     */
    var Cello = { 
        desc: "",
        version: 0.2,
        license: "!! TODO !!", 
        DEBUG: false,
    };

    Cello.log = function(){
        console.log("INFO", arguments);
    };
    
    Cello.debug = function(){
        if (Cello.DEBUG){
            console.log("DEBUG", arguments);
        }
    };

    Cello.assert = function(condition, message) {
        if (!condition) {
            var _mess = "Assertion failed";
            if ( _.isArray(message) )
                _mess = message.join('\n');
            if (message)
                _mess = message;
            throw new Error( _mess );
        }
    };

    /** Helper to add a 'property' getter on models
     */
    Cello.get = function(object, prop_name, getter){

        default_getter = function(){
            Cello.assert(_(object).has("attributes"));
            Cello.assert(_(object.attributes).has(prop_name));
            return object.attributes[prop_name];
        };
        
        object.__defineGetter__(prop_name, getter || default_getter);
    };

    /** Helper to add a 'property' setter on models
        object: object to set
        prop name: property to set
        setter: function which defines the new setter
     */
    Cello.set = function(object, prop_name, setter){
        
        var default_setter = function(val){
            Cello.assert(_(object).has("attributes"));
            
            var old_val = val;
            
            if( _(object).has("attributes") ){
                if ( _(object.attributes).has(prop_name) )
                    old_val = object.attributes[prop_name]
                object.attributes[prop_name] = val;
                
                if (old_val != val){
                    object.trigger("change", object);
                    object.trigger("change:"+prop_name, object, val);
                }
            }
        };
        
        object.__defineSetter__(prop_name, setter || default_setter);
    };
    
    Cello.getset = function(object, prop_name, getter, setter){
        Cello.get(object, prop_name, getter);
        Cello.set(object, prop_name, setter);
    };
    

    /** Make a collection Flagable i.e. add mth to add/remove flag on collection elements
    */
    Cello.FlagableCollection = function(collection){
        /** returns the document having a given flag
         */
        
        //add a helper for each active_flag of the models (defined in model's class attributes)
        var active_flag = collection.model.active_flags || [];
        _.each(collection.model.active_flags, function(flag){ 
            Cello.FlagMethod(collection, flag);
        });
         
        collection.by_flag = function(flag){
            return collection.filter(function(model){
                return model.has_flag(flag);
            });
        };

        // assert models is an array, and all models if not given
        collection._check_models_param = function(models){
            // is models is not given, then all the collection !
            models = _.isUndefined(models) ? this.models : models;
            models = _.isNull(models) ? [] : models;
            // if models is not a array, fix it
            models = _.isArray(models) ? models : [models];
            return models;
        }

        /* Set a flag to elements of a collection
         * Empty list will reset selection
         * @param models: some collection models
         */
        collection.set_flag = function(flag, models){
            // assert models is an array, and all models if not given
            models = collection._check_models_param(models)

            var flagged = collection.by_flag(flag);
            var sorted = _.sortBy(models, sorted);

            if(_.isEqual(flagged, models) === false){
               collection.add_flag(flag, models, true);
            }
        };

        /** Add a flag to models
         *  
         */
        collection.add_flag = function(flag, models, reset, options){
            // should we "reset" ie. set flag only to given documents (false by default)
            var reset = reset === undefined ? false : reset;
            // get document that already have this flag
            var flagged = collection.by_flag(flag);
            // assert models is an array, and all models if not given
            models = collection._check_models_param(models)

            // if nothing to do return...
            if ( flagged.length == 0 && models.length == 0) //TODO le exit si  models.length > 0 (avec flagged.length == 0) n'est possible que si reset == true
                return;

            if ( _.isObject(models) ) {
                var currents = _.union(models, reset ? [] : flagged), // reset if needed 
                    rm = _.difference(flagged, currents),
                    add = _.difference(currents, flagged);
                
                // remove flag on missing
                collection.remove_flag(flag, rm, options);
                
                // add flag on new ones
                _.each(models, function(model){
                    model.add_flag(flag, options);
                });
            }
            
        };

        /** Remove a flag to some elements (or all elements if models list not given)
         */
        collection.remove_flag = function(flag, models, options){
            // assert models is an array, and all models if not given
            models = collection._check_models_param(models)

            _.each(models, function(model){
                model.remove_flag(flag, options);
            });
        };
    };

    /** Make an object Flagable i.e. manage a list of flag and add mth to add/rm theses flags.
    */
    Cello.Flagable = function(model) {

        if (! model.get('flags') ){
           model.set('flags', []);
        }
        
        Cello.get(model, "flags");

        /** Add a flag to the document
         * !! removes silently
         */
        model.add_flag = function(flag, options){
            if(!this.has_flag(flag)){
                this.set("flags", _.union(this.flags, [flag]), {silent:true});
                if ( !options || !options.silent) {
                    this.trigger("addflag", flag, this);
                    this.trigger("addflag:"+flag, this);
                }
            }
        };

        /** Remove a flag to the document
         * !! removes silently
         */
        model.remove_flag = function(flag, options){
            if(this.has_flag(flag)){
                this.set("flags", _.without(this.flags, flag), {silent:true});
                if ( !options || !options.silent) {
                    this.trigger("rmflag", flag, this);
                    this.trigger("rmflag:"+flag, this);
                }
            }
        };

        /** Return true if the document has the given flag
         */
        model.has_flag = function(flag){
            if (!this.flags)
                console.log(this);
            
            return this.flags.indexOf(flag) >= 0;
        };
    };


    /** Add helper method on a collection to add/remove a particular flag
    */
    Cello.FlagMethod = function(collection, flag){
        var add = "add_"+flag, 
            set = "set_"+flag;

        Cello.assert( collection[add] === undefined );
        Cello.assert( collection[set] === undefined );

        collection[set] = function(models){
            collection.set_flag(flag, models, true);
        };

        collection[add] = function(models, reset){
            collection.add_flag(flag, models, reset);
        };
    };


    /**
        param: collection: the sortable collection
        param: sortables: the list of sortables fields
        param: default_key: the field used to sort the collection (by default)
        param: reversed: boolean used to know if the collection is ordered with descending order
     */
    Cello.SortableCollection = function(collection, sortables, default_key, reversed) {
        
        //assert sort attributes
        Cello.assert(_.isString(default_key));
        Cello.assert(_.isObject(sortables));
        
        //create this.sortables collection
        collection.sortables = new Backbone.Collection([], {model:Cello.Sortable})
        Cello.FlagableCollection(collection.sortables);
        
        //fill collection.sortables
        _(sortables).each(function(sortable){
            collection.sortables.add( new Cello.Sortable(sortable) );
        });
        
        collection.listenTo(collection.sortables, "change:selected change:reversed", function(sortable){
            collection.comparator = sortable.get_comparator();
            collection.sort();
        });
        
        //select default field to sort the collection
        console.log(collection.sortables)
        var default_sortable = collection.sortables.findWhere({"field": default_key});
        Cello.assert(default_sortable, "invalid default_key (" + default_key + ")");
        default_sortable.select();
        if (collection.sort_reverse) default_sortable.reverse();
        
        collection.comparator = default_sortable.get_comparator();
        return collection;
    };
    
    
     /** Model of sorting
     */
     Cello.Sortable = Backbone.Model.extend({
        defaults: {
            field: "",        // the field used to sort
            type: "",         // the type of the field (numeric, 
            label: null,      // description of the sorting
        },
        
        /* Set of comparator */
        comparators: {
            "alpha": function(field) {
                var comparator = function(a, b) {
                    return a.get(field).localeCompare(b.get(field));
                };
                return comparator;
            },
            "numeric": function(field) {
                var comparator = function(a, b) {
                    return (a.get(field) - b.get(field)) == 0 ? 0 : (a.get(field) - b.get(field)) > 0 ? 1 : -1;
                };
                return comparator;
            },
        },
        
        initialize: function(attrs, options){
            Cello.Flagable(this);
            // set getter
            Cello.get(this, "field");
            Cello.get(this, "type");
            Cello.get(this, 'selected', function(){ return this.has_flag("selected"); });    // true if selected
            Cello.get(this, 'reversed', function(){ return this.has_flag("reversed"); });    // true if reverse order
            // bind flag ebent to more classic events
            this.listenTo(this, "addflag:selected rmflag:selected", function(){
                this.collection.trigger("change:selected", this);
                this.collection.trigger("change");
            });
            this.listenTo(this, "addflag:reversed rmflag:reversed", function(){
                this.collection.trigger("change:reversed", this);
                this.collection.trigger("change");
            });
            // default label
            if(!_.has(attrs, "label") || !attrs["label"]){
                this.set("label", attrs["field"]);
            }
            // test that type is ok by getting comparator
            var comparator = this.get_comparator();
            return this;
        },
        
        /** Returns the comparator to sort the collection with this sort
        */
        get_comparator: function(){
            var type = this.type;
            var comparator = null;
            if ( _.isFunction(type) ) {
                comparator = type(this.field);
            } else if (_.has(this.comparators, type)) {
                comparator = this.comparators[type](this.field);
            } else {
                throw Error("comparator not found ! (type: '"+type+"')");
            }
            if (this.reversed) {
                var _rev_comparator = comparator;
                comparator = function(a, b){return _rev_comparator(b, a);};
            }
            return comparator
        },
        
        /** Select the current sortable
         */
        select: function(){
            //add "selected" flag to the current model
            if ( !this.selected ) {
                //remove "selected" and "reversed" flags from the previous selected model
                _(this.collection.by_flag("selected")).each( function(model){
                    model.remove_flag("selected");
                    if (model.reversed) model.remove_flag("reversed");
                });
                this.add_flag("selected");
            }
        },
    
        /** Reverse the current sortable
         */
        reverse: function(){
            if ( !this.reversed ) {
                this.add_flag("reversed");
            }
        },
    
        /** Reverse the current or just clear if current is already selected
         */
        toggle_reverse: function(){
            if(this.reversed){
                this.remove_flag("reversed");
            } else {
                this.add_flag("reversed");
            }
        },
     }, 
    //static
    {
        active_flags : ["selected", "reversed"]
    });

// == cellojs/docs.js ==


/** Collection of documents
 * 
 */
Cello.DocList = Backbone.Collection.extend({

// default sort attributes
//    _sort_key: 'title',
//    _sort_reverse: false,
//    _sortables: {},

//    DocumentModel: Cello.Doc,  // the default model used for documents, may be override in initialize
    model: Cello.Doc,

    initialize: function(models, options) {
    
        var _this = this;
        _(this).bindAll("_set_sort_key", "_set_sort_reverse", "_set_sortables", "_get_sort_key", "_get_sort_reverse", "_get_sortables");
        
        options = options || {};
        // getters and setters
        Cello.get(this, 'selected', function(){ return this.has_flag("selected"); });    // true if selected
        
        var sort_key = options.sort_key || "title";
        var sort_reverse = options.sort_reverse || false;
        var sortables = options.sortables || [];
        
        // FlagableCollection
        if (this.model){ // needed for clone() fonction
            Cello.FlagableCollection(this);
            Cello.SortableCollection(this, sortables, sort_key, sort_reverse);
        }
    },

    _set_sort_key : function(sort_key){
        var old_val = this.sort_key;
        this._sort_key = sort_key;
        if (old_val != this.sort_key) {
            this.trigger("change");
            this.trigger("change:sort_key");
        }
    },
    
    _get_sort_key : function(){
        return this._sort_key;
    },
    
    _set_sort_reverse : function(sort_reverse){
        var old_val = this.sort_reverse;
        this._sort_reverse = sort_reverse;
        if (old_val != this.sort_reverse) {
            this.trigger("change");
            this.trigger("change:sort_reverse");
        }
    },
    
    _get_sort_reverse : function(){
        return this._sort_reverse;
    },
    
    _set_sortables : function(sortables){
        var old_val = this.sortables;
        this._sortables = sortables;
        if (old_val != this.sortables) {
            this.trigger("change");
            this.trigger("change:sort_reverse");
        }
    },

    _get_sortables : function(){
        return this._sortables;
    },
    
    // Note: selection mechanism is very similar to the one in blocks with components
    /** Get selected blocks
     * note: better use the getter `this.selected`
     */
    /** Select a document
     */
    select: function(document){
        //XXX plus d'interêt maintenant; à dégager je pense
        document.select();
        //XXX doit-on garder ça maintenant que l'on gère avec les flags
        this.trigger("change:selected");
    },

    /** unselect all selected documents
     */
    clear_selection: function(){
        //XXX plus d'interêt maintenant; à dégager je pense à moins que ce ne soit un helper
        this.set_selected(null);
        // trigger an event to notify the selection change at doclist level
        if( !(options && options.silent)) {
            this.trigger("change:selected");
        }
        // triger an event to notify the selection change at doclist level
        this.trigger("change:selected");
    },

    /** Unselect a document, or all documents
     */
    unselect: function(document){
        //XXX plus d'interêt maintenant; à dégager je pense
        //TODO what if the document is not in the collection ?
        document.remove_flag("selected");
        // triger an event to notify the selection change at block level
        this.trigger("change:selected");
    }
});


// == cellojs/schema.js ==

/**
 *  Cello document, thuis should be extendend in each application
 */
Cello.Doc = Backbone.Model.extend({
    defaults: {
        // core data
        docnum: null,           // this should be provide in init
        // note: other attributes are free (or may be defined by extend)
        // there is not yet schema declaration as in python side

        // 'surfasic' properties
        selected: false,        // whether the document is selected or not
        clusters: null           //{clustering_cid: [list of {cluster: , [opt_attr: , ...]}], ...}
    },
    
    idAttribute : "docnum",

    /** options that may be given
     */
    initialize: function(attrs, options){
        // getter
        Cello.get(this, "docnum");
        Cello.get(this, "selected", function(){ return this.has_flag("selected"); });    // true if selected
        Cello.getset(this, "clusters");
        this.clusters = {};
        
        // add  flags
        Cello.Flagable(this);
        // check
        Cello.assert(this.docnum !== null, "Document should have a docnum");
    },

    /** Select the curent document (got throw the collection)
     */
    select: function(){
        this.add_flag("selected");
    },

    /** Select the curent or just clear selection if curent is already selected
     */
    toggle_select: function(){
        if(this.selected){
            this.remove_flag("selected");
        } else {
            this.add_flag("selected");
        }
    },
},
//static
{
    active_flags : ["selected"]
});

// == cellojs/engine.js ==


    /*
     * Models 
     * 
     * Engine has Blocks
     * Blocks have Components
     * Components have Options
     */

    /**  Basic Model for string query
     */
    Cello.QueryModel = Backbone.Model.extend({
        defaults: {
            cellist: null,      // a Cello.engine
            query: "",
            // surfase attr
            loaded: false,      // wheter the curent query is loaded or not
            //TODO: for now loaded only compare the last resieved query
            // to the curent one but it should also be bind to any engine
            // configuration change
        },

        loaded_query: null,

        initialize: function(attrs, opts){
            //console.log("[init query model]")
            _.bindAll(this, "set_query", "play_completed", "query_updated");
            // add getter
            Cello.get(this, 'cellist');
            Cello.get(this, 'loaded');
            Cello.get(this, 'query');
            Cello.set(this, 'query', this.set_query);
            // connect to cellist, when play succed => mark the query loaded until it changed
            this.listenTo(this.cellist, "play:complete", this.play_completed)
            this.on("change:query", this.query_updated);
        },

        // Query setter (mapped to this.query affectation)
        set_query: function(query){
            //TODO: add validate ?
            query = query.trim();
            console.log("set_query", query);
            this.set('query', query);
        },

        query_updated: function(){
            //console.log("[[query changed !]]");
            if(this.query !== this.loaded_query){
                this.set('loaded', false);
            } else {
                this.set('loaded', true);
            }
        },

        // called when engine play is done
        play_completed: function(response){
            //console.log("[[play completed, update query]]");
            if(response.results.query != this.query){
                this.query = response.results.query;
            }
            this.loaded_query = this.query;
            this.set('loaded', true);
        },


        validate: function(){return true},
        // run the engine
        play: function(){
            this.cellist.play();
        },

        export_for_engine: function(){
            return this.query;
        },
    });

    /**
     * Option: 
     *  json_option = {
     *         "name": "proj_wgt",
     *         "otype": {
     *           "choices": [
     *             "no", "count", "p", "pmin", "pmax","pavg"
     *           ],
     *           "default": "p",
     *           "help": "Projection weighting method",
     *           "multi": false,
     *           "type": "Text",
     *           "uniq": false,
     *           "vtype": "unicode"
    *         },
     *         "type": "value",
     *         "value": "p"
     *       }
     */
    Cello.Option = Backbone.Model.extend({
        defaults: {
            value: undefined,        // the option value
            name: null,              // the option name
            otype: {}                // declaration of the type of the opt value
        },

        idAttribute: "name",

        //TODO: piste pour gérer les validations :
        // https://github.com/thedersen/backbone.validation
        //  -> ca peut etre utile pour les 'value'
        //  -> MAIS AUSSI simplement pour bien décrire les property attendu dans chaque obj

        initialize: function(attrs, options){
            var _this = this;
            _.bindAll(this, "validate");
            
            // add getter
            Cello.get(this, 'name');
            Cello.get(this, 'otype');
            Cello.get(this, 'value');
            Cello.set(this, 'value', function(val){
                var _val = _this.validate(val);
                if (_this.value != _val)
                    _this.set('value', _val);
            });
            // check data
            Cello.assert(this.name !== null, "Option should have a name");
            Cello.assert(attrs.otype !== null, "(Option: "+this.name+") otype should not be 'null'");
            
            // TODO set validators
            
        },

        /* Whether the value is equals to the default value
        */
        is_default: function(){
            return _.isEqual(this.value, this.otype.default);
        },


        cast : function(value){
            var f = function(e){
                return  e;
            };
            
            if(this.otype.vtype === "float") f = parseFloat;
            if(this.otype.vtype === "int") f = parseInt;
            if(this.otype.type === "Boolean"){
                f =  function(e){
                    return  [1, true, "true", "True", "TRUE", "1", "yes"].indexOf(e) >= 0;
                }
            }
            return f(value);
        },
        
        parse: function(val){
            var self = this;
            if (this.otype) {
                if(this.otype.vtype === "float" || this.otype.vtype === "int") {
                    if (this.otype.multi  ) {
                        val = val.replace(/\s/g, '')
                            .split(',')
                            .filter(function(e){ return e.length })
                            .map( function(e){ return self.cast(e);  } );
                            
                        if ( _.isNaN(val) ) val = "";
                    }
                    else {
                        val = self.cast(val);
                        if ( _.isNaN(val) )
                            val = "";
                    }
                }
            }
            return val;
        },    
            
        /** Validate one value
        */
        _validate_one: function(val){
            //val = this.cast(val)
            // check enum
            var choices = this.otype.choices;
            if(choices && _.indexOf(choices, val) < 0){
                throw new Error('invalid option value');
            }
            return val
        },

        is_multi: function(){
            return this.otype.multi;
        },

        validate: function(val){
            var _this = this;
            // TODO; run validators !
            if(this.is_multi()){
                var nval = [];
                _.each(val, function(one_val){
                    nval.push(_this._validate_one(one_val));
                })
                val = nval;
            } else {
                val = this._validate_one(val);
            }
            return val;
        },
    });

    /**
     * Collection of Cello.Option
     */
    Cello.Options = Backbone.Collection.extend({
        model : Cello.Option,
        
    });


    /*
     * Cello Component i.e. minimal processing unit
     */
    Cello.Component = Backbone.Model.extend({
        idAttribute: 'name',
        defaults: {
            name: null,   // the option name
            selected: false, // wheter the component is selected
            doc: "",     // component help doc //TODO rename it "help", doc ca porte a confusion avec document
            options: new Cello.Options()    // Collection of options
        },
        
        initialize: function(){
            // getter/setter
            Cello.get(this, "name");
            Cello.get(this, "options");
            Cello.get(this, "selected");
            
            // listen for change in options collection.
            this.listenTo(this.options, 'reset', this.optionsChanged);
            this.listenTo(this.options, 'change', this.optionsChanged);
            // check data
            Cello.assert(this.name !== null, "Component should have a name");
        },

        get_option: function(name){
            return this.options.where({"name": name})[0];
        },

        set_option: function(name, new_value){
            var opt = this.get_option(name);
            opt.value = new_value;  
        },

        parse: function(data, options){ 
            data.options = new Cello.Options(data.options, {parse:true});
            // if default == true then select itself
            if(data.default){
                data.selected = true;
            }
            return data;
        },

        optionsChanged: function(model) {
            // trigger new event.
            this.trigger('change', this, model);
            this.trigger('change:options', this, model);
        },

        /* List of options differents than default
        */
        changed_options: function(){
            var options = [];
            _.each(this.options.models, function(opt){
                if(!opt.is_default()){
                    options.push(opt);
                }
            });
            return options;
        },

        /** Returns a dictionnary representation of the component
         *
         * if 'minimal' is given only the changed options from 
         */
        as_dict: function(minimal){
            if(minimal === undefined || minimal == null){
                minimal = false;
            }
            var drepr = {
                name: this.name,
            };
            var listed_options = minimal ? this.changed_options() : this.options.models
            if(listed_options.length > 0){
                drepr.options = {};
                _.each(listed_options, function(opt){
                    drepr.options[opt.name] = opt.value;
                });
            }
            return drepr;
        },
        
        set_state: function(state){
            var _this = this;
            _.each(state, function(value, opt_name){
                _this.set_option(opt_name, value);
            });
        },
    });


    /**
     * Collection of Cello.Component
     */
    Cello.Components = Backbone.Collection.extend({
        model: Cello.Component,
    });

    /**
     * A processing "block" i.e. a list of possible Component
     */
    Cello.Block = Backbone.Model.extend({
        defaults : {
            name: "",           // name of the component
            components: new Cello.Components(),  // collection of components
            required: true,
            multiple: false,
            args: null,         // input names
            returns: null,      // ouput name
        },

        initialize: function(attrs){
            // add getter
            var _this = this;
            Cello.get(this, 'components');
            Cello.get(this, 'selected', this._get_selected);
            Cello.get(this, 'name');
            Cello.get(this, 'required');
            Cello.get(this, 'multiple');
            Cello.get(this, 'args');
            Cello.get(this, 'returns');

            // check needed values
            Cello.assert(this.name !== null, "Block should have a name");
            Cello.assert((_.isNull(this.args) || _.isArray(this.args)), "'args' should be null or an Array");
            if(this.returns === null){
                this.set("returns", this.name)
            }
            // binds components changes
            this.listenTo(this.components, 'reset', this.componentsChanged);
            this.listenTo(this.components, 'change', this.componentsChanged);
            //Note: for the selection the binding is not automatic
            // as the selection change must pass throw Block
            // an event it direcly trigger from the Block

            // store default selected (the ones that are selected in init
            this.selection_default = _.map(this.selected, function(comp){return comp.name});
            //TODO: make it arrive from server
        },

        componentsChanged: function(model) {
            // trigger new event
            this.trigger('change', this, model);
            this.trigger('change:components', this, model);
        },

        parse: function(data, options){
            // set components
            data.components = new Cello.Components(data.components, {parse:true});
            return data;
        },

        /* clear components */
        reset: function(){
            this.components.reset();
        },

        /** Get a component from it name
         */
        get_component: function(name){
            return _.find(this.components.models, function(comp){
                return comp.name == name;
            });
        },

        /** get seleced blocks
         * not better use the getter block.selected
         */
        _get_selected: function(){
            return this.components.where({'selected': true});
        },

        /** Select a component or unselect it if already selected
         * (and block allow to have no selected component)
         */
        select: function(optionable){
            //TODO what if the component is not in the block ?
            if(optionable.selected) {
                if(!this.required){
                    optionable.set('selected', false);
                    // triger an event to notify the selection change at block level
                    this.trigger("change");
                    this.trigger("change:selected");
                }
            } else {
                if(!this.multiple){
                    _.each(this.selected, function(component){
                        component.set('selected', false);
                    });
                }
                optionable.set('selected', true);
                // triger an event to notify the selection change at block level
                this.trigger("change");
                this.trigger("change:selected");
            }
        },

        /** unselect a component
         */
        unselect: function(optionable){
            //TODO what if the component is not in the block ?
            if(!optionable.selected) return ;
            // unselect if possible...ie not require OR more than one selected
            if( !this.required || (this.multiple && this.selected.length > 1)) {
                optionable.set('selected', false);
                // triger an event to notify the selection change at block level
                this.trigger("change");
                this.trigger("change:selected");
            } else {
                //throw new Error("unselect possible only when multiple is true or not required ");
            }
        },

        /** If component is not required permit to un-select
         */
        clear_selection: function(){
            var _this = this;
            _.each(this.selected, function(component){
                _this.unselect(component);
            });
        },

        /* check component is setup */
        validate: function(){}, //TODO
        
        /** Returns the state of the block current
         */
        get_state: function(minimal){
            if(minimal === undefined || minimal == null){
                minimal = false;
            }
            var comps = [],
                selections = this.selected;
            var default_selected = _.isEqual(_.map(selections, function(comp){return comp.name}), this.selection_default)
            
            for (var j in selections){
                var component = selections[j];
                var comp_state = component.as_dict(minimal);
                if(!minimal || !default_selected || _.has(comp_state, "options") ) {
                    // we do not add it if minimal and selection is same as default and no special config
                    comps.push(component.as_dict(minimal));
                }
            }
            return comps
        },

        set_state: function(state){
            var _this = this;
            _.each(state, function(comp_config){
                var comp_name = comp_config["name"];
                var comp_state = comp_config["options"];
                var comp = _this.get_component(comp_name);
                comp.set_state(comp_state);
                _this.select(comp);
            });
        },
    });


    /**
     * Collection of Cello.Block
     */
    Cello.Blocks = Backbone.Collection.extend({
        model: Cello.Block
    });


    /** Cello Engine
     * 
     * ie. the Cello API client
     * basicly a list of Block
     */
    Cello.Engine = Backbone.Model.extend({
        defaults: {
            blocks: new Cello.Blocks(),  // collection de blocks
            args: null,                  // all posisble inputs
            returns: null,               // all possible outputs
            needed_inputs: []            // list of needed_inputs
        },

        // init an engine
        initialize: function(attrs, options){
            // default url value
            var url = attrs.url;

            // dict of models containing input data (populated with this.register_input)
            this.input_models = {}

            this.url = url;
            this.play_url = url;

            Cello.get(this, 'blocks');
            Cello.get(this, 'args');
            Cello.get(this, 'returns');
            Cello.get(this, 'needed_inputs');

            this.listenTo(this.blocks, 'change reset', this.blockChanged);
        },

        /** Returns a block from it name
         */
        get_block: function(name){
            return _.find(this.blocks.models, function(block){
                return block.get('name') == name;
            });
        },

        /** Called when a block changed
         */
        blockChanged: function(model) {
            this._update_needed_inputs();
            // trigger new event.
            this.trigger('change', this, model);
            this.trigger('change:blocks', this, model);
        },

        /** update the list of all needed input according to the current engine
            configuration.
         */
        _update_needed_inputs: function(){
            var needed = [];
            var available = [];
            var blocks = this.blocks.models;
            for(var i in blocks){
                var block = blocks[i];
                if(block.selected.length > 0){
                    // check all inpouts
                    for(var j in block.args){
                        var arg = block.args[j];
                        if(available.indexOf(arg) < 0 && needed.indexOf(arg)){
                            // if not available then needed !
                            needed.push(arg);
                        }
                    }
                    // add available
                    available.push(block.returns);
                }
            }
            this.set({"needed_inputs":needed}, {silent:true});
        },

        // create engine model (and neested models) from a cello API json
        parse: function(data, options){
            console.log('Engine parse', data, options)
            // create the blocks
            this.data = data;
            data.blocks = new Cello.Blocks(data.blocks, {parse:true});
            return data;
        },

        /** Reset the engine with data (same formet as from fetch)
         */
        reset: function(data){
            data = this.parse(data);
            //console.log(data)
            this.set(data);
        },

        /* Returns a keb repr ready for json serialization */
        get_state: function(minimal){
            if(minimal === undefined || minimal == null){
                minimal = false;
            }
            var response = {};
            var blocks = this.blocks.models;
            for (var i in blocks){
                var block = blocks[i];
                var block_state = block.get_state(minimal);
                if(block_state.length > 0){
                    response[block.name] = block_state;
                }
            }
            return response;
        },

        /* Configure the engine from a state object (get state) */
        set_state: function(state){
            var _this = this;
            _.each(state, function(block_state, block_name){
                var block = _this.get_block(block_name);
                block.set_state(block_state);
            });
        },  

        /* return a str version of the current engine config
        this str can be part of an url
        */
        get_state_str: function(minimal){
            var state = this.get_state(minimal);
            var str = $.param(state);
            //TODO: check config size for url (<4k)
            //TODO: add base64 compression:
            //var config = JSON.stringify(app.models.cellist.get_state(true));
            //config = LZString.compressToBase64(config);
            return str;
        },

        /* Set the state of the engine from an str config (see get_state_str)
        */
        set_state_str: function(state_str){
            var state = Cello.utils.deparam(state_str);
            //TODO: add compression :
            //var state = LZString.decompressFromBase64(config);
            //state = JSON.parse(state);
            this.set_state(state);
        },

        register_input: function(arg_name, model){
            this.input_models[arg_name] = model;
        },

        /** Request the server with current engine configuration and given inputs
         */
        play: function(kwargs){
            var _this = this;
            var state = this.get_state();
            var inputs = {}
            _.each(this.input_models, function(model, in_name, all){
                inputs[in_name] = model.export_for_engine();
            })
            //TODO check needed inputs
            var inputs = _.extend(inputs, kwargs);
            var data  = _.extend({}, inputs, {'options': state});

            Cello.log("play", data);
            
            _this.trigger("play:loading", inputs, state);

            var data = JSON.stringify(data);
            // console.log( "Engine", this.play_url, data );
            
            Backbone.ajax({
                url: _this.play_url,
                method: 'post',
                contentType: "application/json",
                data: data,
                success: function(response, status, xhr){
                    // get a 200 (or 2**) anwser
                    if(response.meta && response.meta.errors && response.meta.errors.length > 0){
                        // contains a 'cello' error
                        _this.trigger("play:error", response, xhr);
                    } else {
                        console.log("play:success", response, kwargs, state);
                        _this.trigger("play:success", response, kwargs, state);
                        _this.trigger("play:complete", response, kwargs, state);
                    }
                },
                error: function(xhr, textStatus, errorThrown){
                    // get an HTTP error answer (get a 5**)
                    _this.trigger("play:error", {}, xhr);
                    _this.trigger("play:complete", {}, xhr);
                },
            });
        },

    });

// == cellojs/graph.js ==


/** 
 * Classes:
 *  Cello.Graph
 *  Cello.Vertex
 *  Cello.Vertices
 *  Cello.Edge
 *  Cello.Edges 
 * 
 * TODO:
 *  REMOVE  hard coded URLS !!!!!
 */


var Graph = Backbone.Model.extend({
    // const
    IN : 1,
    OUT : 2,
    ALL : 4,
    // defaults model attributes
    defaults : {
        // graph properties
        gid : null,
        directed: false,
        bipartite: false,
    },

    idAttribute: 'gid',

    initialize: function(attrs, options){
        // init
        var _this = this;
        //_.bindAll(this, "_add_vertex", "_add_edge", "_remove_vertex", "_remove_edge", "_update_types");

        this.edge_list = {}; // {nid: [Edge, ...], ... }

        this.nodetype_model = attrs.nodetype_model || NodeType;
        this.nodetypes = new TypeCollection([], { model: this.nodetype_model });

        this.edgetype_model = attrs.edgetype_model || EdgeType;
        this.edgetypes = new TypeCollection([], { model: this.edgetype_model });
        
        if ( !this.properties )
            this.properties = new Backbone.Model();

        if ( !this.meta )
            this.meta = new Backbone.Model();

        Cello.get(this, "label", function(){
            return this.properties.get('name')
        });
        
        this.urlRoot = attrs.urlRoot;
        if ( this.urlRoot ) {
             var _update_types = function(uuid){
                _this.nodetypes.url = _this.url() +"/nodetypes"; 
                _this.nodetypes.reset();
                _this.nodetypes.fetch({remove: false});
                
                _this.edgetypes.url = _this.url() +"/edgetypes";
                _this.edgetypes.reset();
                _this.edgetypes.fetch({remove: false});
            }
                        
            this.on("change:gid", _update_types);
            
            this.nodetypes.on( "add", function(t){
                t.urlRoot = _this.url() + "/nodetype"
            });
            this.edgetypes.on( "add", function(t){ t.urlRoot = _this.url() + "/edgetype"  });
        }
        
        this.vertex_model = attrs.vertex_model || Vertex;
        this.vs = new Cello.Vertices([],{graph:this, model: this.vertex_model}); // <Vertex> collection
        this.vs.reset([], { collection : this.vs });

        var _add_vertex = function(vertex){
            if (vertex){
                vertex.collection = _this.vs;
                if (vertex.id === undefined){
                    vertex.id = _this.vs.size();
                }
                if ( ! (vertex.id in _this.edge_list) ){
                    _this.edge_list[vertex.id] = [];
                }
            }
        };

        var _remove_vertex = function(vertex){
            /** removes edges belonging to the node */    
            var edges = _this.es.filter(function(e){ return e.get('source') == vertex.id || e.get('target') == vertex.id });
            _this.es.remove(edges);
            delete _this.edge_list[vertex.id];
        };
        
        this.vs.on("add", _add_vertex);
        this.vs.on("remove", _remove_vertex);
        
        this.edge_model = attrs.edge_model || Edge;
        this.es = new Cello.Edges([],{graph:this, model:this.edge_model}); // <Edge> collection
        this.es.reset([], { collection : this.es });

        /* callback on add edge */
        var _add_edge = function( edge ){
            edge.collection = _this.es;
            _this.edge_list[edge.get('source')].push(edge);
            _this.edge_list[edge.get('target')].push(edge);
        };
        
        var _remove_edge = function(edge){
            /** clean edgelist */    
            _this.edge_list[edge.get('source')].splice( _this.edge_list[edge.get('source')].indexOf(edge), 1 );
            _this.edge_list[edge.get('target')].splice( _this.edge_list[edge.get('target')].indexOf(edge), 1 );
        };
        
        this.es.on( "add", _add_edge);
        this.es.on( "remove", _remove_edge);

        Cello.FlagableCollection(this.vs);
        Cello.FlagableCollection(this.es);
        
        if (attrs.data)
            this.reset(attrs.data);
    },

    url: function(){
        return this.urlRoot + this.id;
    },

    parse: function(data, options){
        this.reset(data[this.id], options);
    },
    
    reset: function(data, options){
        
        // create a graph from json data
        Cello.debug("parse graph", data);

        if (data.nodetypes)
        {
            this.nodetypes.set({ 'nodetypes': data.nodetypes } , { merge: true, remove:false, parse:true });
        }
        if (data.edgetypes)
        {
            this.edgetypes.set({ 'edgetypes': data.edgetypes }, { merge: true, remove:false, parse:true });
        }
        if (data.properties)
            this.properties.set(data.properties, {parse:true})
        if (data.meta)
            this.meta.set(data.meta, {parse:true})

        options = options ? _.clone(options) : {};
        if (data.vs && data.es){

            this.edge_list = {};

            this.es.reset([], options);
            this.vs.reset([], options);
            options = {parse:true};
            this.vs.set(data.vs, options);
            this.es.set(data.es, options);
        }

        this.trigger('reset');
        
    },

    merge: function(data, options){
        // create a graph from json data
        Cello.debug("merge graph", data);

        if (data.nodetypes)
            this.nodetypes.set({ 'nodetypes': data.nodetypes } , {remove:false, parse:true});
        if (data.edgetypes)
            this.edgetypes.set({ 'edgetypes': data.edgetypes }, {remove:false, parse:true});
        if (data.meta)
            this.meta.set(data.meta, {parse:true})
        if (data.properties)
            this.properties.set(data.properties, {parse:true})
        
        this.vs.add(data.vs, {parse:true});
        this.es.add(data.es, {parse:true});
        
        this.trigger('merge');
        
    },

    get_edge_type: function(uuid){
        var nt = this.edgetypes.get(uuid);
        if (nt) return nt;
    },

    get_node_type: function(uuid){
        var nt = this.nodetypes.get(uuid);
        if (nt) return nt;
        //if (uuid) {
            //var nt =  new this.nodetype_model({name:uuid, uuid:uuid});
            //this.nodetypes.add(nt)
            //return nt;
        //}
    },

    summary: function(){
        /* Returns the summary of the graph **/
        // <{'attr':value, ...}> graph.summary()
        return {
            attrs: this.attributes,
            vcount: this.vcount(),
            ecount: this.ecount(),
            density: this.density(),
            v_attrs: this.attributes.v_attrs,
            e_attrs: this.attributes.e_attrs
        };
    },
    
    str: function(){
        // <str> graph.toString()
        /** Returns the graph summary as a string */
        var template = _.template("v:<%=vcount%>, e:<%=ecount%>," +
            "density:<%=density%>,\n" +
            "v attrs:<%=v_attrs%>, \n" +
            "e attrs:<%=e_attrs%>, "
        );

        return template( this.summary() );
    },

    // === Vertex ===
    // graph nodes and edges manipulation

    add_vertex: function(vertex){
        /** Add a Cello.Vertex vertex  
         * <void> graph.add_vertex(vertex)
         */            
        this.vs.add(vertex);
    },
    

    
    // <int> graph.vcount()
    vcount : function(){
        /* count of vertices in the graph */
        return this.vs.length;
    }, //<int>



    // === Edges ===
    add_edge: function(edge){
        this.es.add(edge);
    },

    /**
     * Checks whether a specific set of edges contain loop edges
     * @param edges: edge indices which we want to check. If C{None}, all
     *  edges are checked.
     * @return: a list of booleans, one for every edge given
     **/
    is_loop: function(edges){
        //TODO comportement a la igraph si edges undifined => sur tout g.es
       var isloop = function(edge){
           return edge.source === edge.target;
           //TODO return edge.is_loop()
       };
       return _.map(edges, isloop);
    },

    /** Return count of edges in the graph */
    ecount: function(){
        return this.es.length;
    }, //<int>

    /** Returns list of incident edges
     * @param vertex: vertex to consider
     * @param mode: IN OUT or ALL
     * @param loops: whether self-loops should be returned.
     * */
    incident: function(vertex, mode, loops){
        var graph = this,
            edges = [],
            vid = vertex.id,
            _mode = mode === undefined ? this.ALL: mode,
            _loops = loops === undefined || loops;
        
        if (_mode == graph.ALL ){
            edges = _.filter(graph.edge_list[vid], function(edge){
                    return ( !_loops ? !edge.is_loop() : true );
                });
        }
        else if (_mode == graph.IN ){
            edges = _.filter(graph.edge_list[vid], function(edge){
                    return edge.source.id == vid && ( !_loops ? !edge.is_loop() : true );
                });
        }
        else if (_mode == graph.OUT ){
            edges = _.filter(graph.edge_list[vid],function(edge){
                    return edge.target.id == vid && ( !_loops ? !edge.is_loop() : true );
                });
        }
        return edges;

    },

    degree: function(vertex, mode, loops ){
        /** Returns some vertex degrees from the graph.
         * This method accepts a single vertex ID or a list of vertex IDs as a
         * parameter, and returns the degree of the given vertices (in the
         * form of a single integer or a list, depending on the input
         * parameter).
         * <int> or [<int>] degree(vertices, mode=ALL, loops=True)

         * @param vertices: a single vertex ID or a list of vertex IDs
         * @param mode: the type of degree to be returned (L{OUT} for
         *  out-degrees, L{IN} IN for in-degrees or L{ALL} for the sum of
         *  them).
         * @param loops: whether self-loops should be counted.
         * @return <int> or [<int>] degrees
        **/
        return this.incident(vertex, mode, loops).length;
    }, //

    neighbors: function(vertex, mode, loops){
        var edges = this.incident(vertex, mode, loops);
        var nodes = _(edges).map(function(edge){
            return edge.source != vertex ? edge.source : edge.target;
        });

        //console.log( vertex.label, _.map(nodes, function(e){return e.label}) )
        return nodes;
    },

    strength: function(vertex, mode, loops){
        /**
         * Returns the strength (weighted degree) of some vertex from the graph
         *
         * This method accepts a single vertex ID or a list of vertex IDs as a
         * parameter, and returns the strength (that is, the sum of the weights
         * of all incident edges) of the given vertices (in the
         * form of a single integer or a list, depending on the input
         * parameter).
         * <int> strength(vertices, mode=ALL, loops=True)
         *
         * @param vertex: a single vertex 
         * @param mode: the type of degree to be returned (L{OUT} for
         *   out-degrees, L{IN} IN for in-degrees or L{ALL} for the sum of
         *   them).
         * @param loops: whether self-loops should be counted.
        **/
        var incident = this.incident(vertex, mode, loops);
        var _strength = function  (memo, edge){ // reduce sum
            return memo + edge.weight;
        };
        return _.reduce(incident, _strength, 0);
    },

    
    select: function(props) {
        /**
        taken from igraph.vs.select props part only
        params: props dict of pairs (keyword, value)
                keyword is 'attr_kw'
                * attr{_.keys(doc)} doc attrs
                * kw{ne}: not equal to
                * kw{eq}: equal to
                * kw{lt}: less than
                * kw{gt}: greater than
                * kw{le}: less than or equal to
                * kw{ge}: greater than or equal to
                * kw{in}: checks if the value of an attribute is in a given list
                * kw{notin}: checks if the value of an attribute is not in a given list
        return:  function filter for theses props
        >>> filter = create_filter({'score:lt' : 1, 'label':"boo"})
        >>> // same has
        >>> filter = filter({'score:lt' : 1, 'label:eq':"boo"})
        * select using vertex method
        >>>
        */
        // vertex allowed method
        var methods = {"degree":1, "strength":1 };
        
        var filter = function(obj){
            for (var k in props) {
                var value = props[k];
                var kf = k.split(':');
                var kname = kf[0];
                var keyword = kf.length == 2 ? kf[1] : 'eq';
                var obj_value;
                
                if (kname.substring(0,1) == '_' ){ // vertex method 
                    method = kname.slice(1);
                    if (method in methods) {
                        obj_value = obj[method]();
                    }
                }
                else  // vertex attr
                    obj_value = obj.get(kname);
                
                if (keyword == 'eq') { 
                    if (_.isEqual(obj_value, value) === false) return false; }
                else if (keyword == 'ne') { 
                    if (obj_value == value) return false;}
                else if (keyword == 'lt') { 
                    if ((obj_value < value) === false) return false; }
                else if (keyword == 'gt') { 
                    if ((obj_value > value) === false) return false; }
                else if (keyword == 'le') { 
                    if ((obj_value <= value) === false) return false; }
                else if (keyword == 'ge') { 
                    if ((obj_value >= value) === false) return false; }
                else if (keyword == 'in') { 
                    if (_.indexOf(value, obj_value) === -1) return false; }
                else if (keyword == 'notin') { 
                    if (_.indexOf(value, obj_value) !== -1) return false; }
//            else if (keyword == "inter"){ 
//                  if (_.indexOf(value, obj_value) != -1) return false; }
            }
            return true; // congrat, you passed the test
        };
        return _.filter(this.vs.models, filter);
    }, // apply filter

    /* Return a random vertex from the graph
     *  -first take a random edge from graph.es
     *  -then head/tail the source or target vertex from the edge 
     */
    random_vertex: function(){
        var random_edge = this.es.at(random_int(0, this.es.size()-1));
        //console.log("random",random_edge)
        return Math.random() > 0.5 ? random_edge.source : random_edge.target; 
    },

    // Graph theory

    /* <float> density() */
    density: function() {
        /** Returns the number of edges vs. the maximum number of possible edges.
         * For example, <0.35 => sparse, >0.65 => dense, 1.0 => complete.
         */
        return 2.0*this.es.length / (this.vs.length * (this.vs.length-1));
    },

    /**
     * FIXME  not working
     *
     * will be used with dijkstra algo to find shortest path
     * TODO directed undirected
     */
    adjacency : function(){
        var adj_matrix = [],
            _i_ = Infinity,
            len = 0;
        // create empty matrix
        var zeros = function(){return 0;};
        for (len=this.vcount(), i = 0; i<len; i++){
           adj_matrix.push(_.range(len).map(zeros));
        }
        // fill with edges
        for ( len=this.ecount(), i=0; i<len; i++  ){
            var edge = this.es[i];
            adj_matrix[edge.source][edge.target] = edge.weight;
        }
        this.adjacency =  adj_matrix;
    }
    
});

var Type = Backbone.Model.extend({

    idAttribute: "uuid",

    defaults: {
        //  attrs
        name: "",
        count: 0,
        description: "",
        type_attributes: {},    //  attrs
        properties: new Cello.Options(),    // Collection of options
        material:  {},    // Collection of options
    },

    get_property: function(name){
        return this.properties.where({"name": name})[0];
    },

    add_property: function(name, option){
        
    },

    delete_property: function(name, option){},

    parse: function(data, options){
        var props = []
        for (k in data.properties){
            props.push( { name: k,
                          otype: data.properties[k]   
                       });
                
        }
        return  {
                type_attributes : data.type_attributes,
                properties : new Cello.Options( props, {parse:true}),
                name : data.name,
                description : data.description || "",
                uuid : data.uuid
            }
    },

    toString: function (){
        return this.get('name');
    },

    toJSON: function(options) {
      var data =  _.pick(this.attributes, 'name', 'description', 'uuid', 'type_attributes');
      var models = this.get('properties').models;
      var props = {}
      for (var i in models ){
        var prop = models[i];
        if (prop.get('name') != "")
            props[prop.get('name')] = prop.get('otype')
      }
      data.properties = props;
      return data
    },
});

var NodeType = Type.extend({
    // init
    initialize: function(attrs, options){
        Cello.get(this, "count");
        Cello.get(this, "name");
        Cello.get(this, "properties");
        Cello.get(this, "type_attributes", function() {
            return this.get('type_attributes');
        });
        
        Cello.get(this, "label", function(){
            var label = this.get('name');
            return  label === undefined ? "" : label;
        });
        
        var _this = this;
        this.on("sync", function(model, resp, options){
            Backbone.trigger("nodetype:save", this, resp, options)
        });

        this.listenTo( this.attributes.properties, 'change', function(){
            _this.trigger('change:properties', _this.attributes.properties);
        });
    },
});

var EdgeType = Type.extend({
    // init
    initialize: function(attrs, options){
        Cello.get(this, "name");
        Cello.get(this, "count");
        Cello.get(this, "type_attributes", function() {
            return this.get('type_attributes');
        });
        
        Cello.get(this, "properties");
        Cello.get(this, "label", function(){
            var label = this.get('name');
            return  label === undefined ? "" : label;
        });
        

        this.on("sync", function(model, resp, options){
                Backbone.trigger("edgetype:save", this, resp, options)
        });
    },
});

var Vertex = Backbone.Model.extend({
    /**
     * Class representing a single vertex in a graph.
     * get attributes by calling 'get' method
     * >>> v.get('color')
     */
    idAttribute: "uuid",

    defaults: {
        // vertex attrs
        uuid: "",
        nodetype: "",
        label: "",
        color: [0,0,0],
        coords:[0,0,0], 
    },
    
    initialize: function(attrs, oprions) {
        
        var vertex = this;
      
        Cello.get(this, "graph", function(){
                return vertex.collection != null ? vertex.collection.graph : null;
            });            
        Cello.get(this, "type", function(){ return this.nodetype});
        Cello.get(this, "nodetype",  function(){
                return vertex.graph ? vertex.graph.get_node_type( vertex.get('nodetype') ): null;
            });

        Cello.get(this, "properties", function(){ return vertex.get('properties')});
        if ( !this.properties )
            this.set('properties', new Backbone.Model());
            
        Cello.get(this, "label", function(){
            var label = vertex.properties.get('label');
            return  label === undefined ? "" : label;
        });
        Cello.get(this, "formatted_label", this.format_label);


        this.clusters = {} //{clustering_cid: [list of {cluster: , [opt_attr: , ...]}], ...}

        Cello.getset(vertex, "color");


        this.on("sync", function(model, resp, options){
            //if (! (options || options.is_cancel) )
            Backbone.trigger("node:save", vertex, resp, options)
        });
        this.on("change:cl_color", function(vtx){
            vtx.set('color', vtx.get('cl_color')) ;
        });
        this.on("change", function(vtx){
            vtx._neighbors = null;
        });
        
        Cello.Flagable(this);
        _.bindAll(this, 'degree', 'format_label', 'neighbors', 'strength');

    },

    getHexColor : function(){
        /* returns int color value  */
        return 0;//this.get('color') ;
    },
    
    
    format_label : function(length){
        var label = this.label
        if (length) {
            label = label.substring(0,length)
        }
        return [ {form : label, css : ".normal-font"} ];
    },
    
    

    /* <int> vertex.degree(mode=ALL, loop=true) */
    degree: function(mode, loop){
        /** Proxy method
         *  @see  Graph.degree(vertices, mode, loops)
         */
        return this.graph.degree(this, mode, loop );
    },
    
    /* <float> vertex.strength(mode=ALL, loop=true) */
    strength: function(mode, loop){
        /** Proxy method
         *  @see  Graph.strength(vertices, mode, loops)
         */
         return this.graph.strength(this, mode, loop);
    },
    
    /* [<Edge>] vertex.incident(mode=ALL, loop=true) */
    incident : function(mode, loop){
        return this.graph.incident(this, mode, loop);
    },

    /* [<Vertex>] vertex.neighbors(mode=ALL, loop=true) */
    neighbors : function(mode, loop){
        /** Proxy method
         *  see  Graph.neigbors(mode=ALL, loop=true)
         */
        return this.graph.neighbors(this, mode, loop);
    },

}, 
//static
{
    active_flags : []
});


/**
 * Class representing a single edge in a graph.
 */
var Edge = Backbone.Model.extend({

    idAttribute: "uuid",
    
    defaults : {
    },

    constructor: function() {
        Backbone.Model.apply(this, arguments);
        var edge = this;

        Cello.get(this, "graph", function(){
                return edge.collection != null ? edge.collection.graph : null;
            });
        Cello.get(this, "type", function(){ return edge.edgetype});
        Cello.get(this, "edgetype",  function(){
                return edge.graph ? edge.graph.get_edge_type( edge.get('edgetype') ): null;
            });
        Cello.get(this, "source", function(){
            return edge.graph ? edge.graph.vs.get(edge.get("source")) : null;
        } );
        Cello.get(this, "target", function(){
                return edge.graph ? edge.graph.vs.get(edge.get("target")) : null;
            } );
        Cello.get(this, "weight", function(){
                return edge.graph ? edge.graph.vs.get(edge.get("weight")) : null;
            } );

        Cello.get(this, "sym", this.sym);
        
        Cello.get(this, "properties", function(){ return edge.get('properties')});
        Cello.get(this, "label", function(){
            var label = edge.properties.get('label');
            if ( label == null || label.length == 0  )
                if (edge.edgetype)
                    return edge.edgetype.name
            return label;
        });
        if ( !this.properties )
            this.set('properties',  new Backbone.Model());

        Cello.Flagable(this);

        this.on("sync", function(model, resp, options){
            Backbone.trigger("edge:save", model, resp, options)
        });
    },
    
    str: function(){
        var func = function(v, k){ return k+ ": "+ v; };
        return   "("+this.get('s') + "," + this.get('t')+")  " +
            this.source.label + "-->" +  this.target.label+','  +
            _.map(this.attributes, func).join(', ');
    },

    tuple: function(){},
    
    /* Return the symetrical Edge of the current Edge in the graph, null otherwise*/
    sym: function(){
        return _(this.collection.models).findWhere({source:this.target, target:this.source});
    },

    is_loop: function(){
        return this.source.id == this.target.id;
    }
}, 
//static
{
    active_flags : []
});


var Vertices = Backbone.Collection.extend({
    model: Vertex,
    
    
    initialize: function(models, options){
        _this = this;
        
        if ( options ){
            this.graph = options.graph;
        }

    },
    
    copy_attr: function(src, dest, options){
        /*
         * copy src attr into dest attr
         * param src: src attr name
         * param dest: target attr name
         *      todo dest could be a function 
         **/
        _.map(this.graph.vs.select({}), function(model){
            model.set(dest, model.get(src), options);
        });
    },
    
    select: function(props){
        return this.graph.select(props);
    },
});

var Edges = Backbone.Collection.extend({
    model: Edge,

    initialize: function(models, options){
        this.graph = options.graph;
    },

    between: function(src, tgt, directed){
        if (src && tgt)
        {
            return this.models.filter(function(e){
                if (directed) return e.source == src & e.target == tgt;
                return (e.source == src | e.source == tgt) & (e.target == src | e.target == tgt);
            });
        }
    },
});

var TypeCollection = Backbone.Collection.extend({
    model: Type,

    //url: function(){
        //return this.ur
    //},
    
    parse: function(data){
        if ('nodetypes' in data)
            return data.nodetypes; 
        else if ('edgetypes' in data)
            return data.edgetypes; 
    }
});


Cello.Graph = Graph;
Cello.Type = Type;
Cello.Vertices = Vertices;
Cello.Vertex = Vertex;
Cello.Edges = Edges;
Cello.Edge = Edge;
Cello.EdgeType = EdgeType;
Cello.NodeType = NodeType;


// Returns a random integer between min and max
// Using Math.round() will give you a non-uniform distribution!
function random_int(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// == cellojs/clustering.js ==

/**
 * Clustering models
 * 
 * Note: the design of Cello.Clustering is similar to Cello.DocList model
 */
 


    /**
     * A label describing a cluster
     */
//    Cello.ClusterLabel = Backbone.Model.extend({
    Cello.ClusterLabel = Backbone.Model.extend({
    
        idAttribute : "id",
        /**
         *  label can be overriden at initialize 
         */ 
        defaults: { 
            label: "",    // the text of the label
            score: 1,
            role: "*",      // the "role" (ie kind of type) of the label
            size: 12 ,
            clusters: null //{clustering_cid: [list of clusters], ...}
        },
        
        initialize: function(){
            Cello.get(this, "label");
            Cello.get(this, "role");
            Cello.get(this, "score");
            Cello.getset(this, "clusters");
            this.clusters = {};
            
            _.bindAll(this, '_format_label');
        
            Cello.get(this, "formatted_label", this._format_label);
            Cello.Flagable(this);

        },
        
        _format_label : function(){
            return [ {form :this.get('label'), css: "normal"} ];
        },
        
    },
    //static
    {
        active_flags : []
    });

    /** Cluster
     *  labels: list of labels
     **/ 
    Cello.Cluster = Backbone.Model.extend({
        defaults: { 
            // core attributes
            members: {}, // list of this cluster's members
            labels: [], // list of this cluster's labels
            misc: false,
            // more surfacic attributes
            selected: false,    // is the cluster selected ?
            color: [200,200,200],
         },
         
        initialize: function(attrs, options){
            var _this = this;
            // Getters
            _.bindAll(_this, "_compute_membership", "_compute_colors");

//            Cello.get(this, 'clustering');
            Cello.get(this, 'members');
            Cello.getset(this, 'labels');
            Cello.get(this, 'misc');
            Cello.getset(this, 'color'); //TODO; add validate on setter
            Cello.get(this, 'selected', function(){ return _this.has_flag("selected"); });    // true if selected
            
            this.listenTo(this, "addflag:selected rmflag:selected", function(){
                _this.collection.trigger("change:selected");
            });
            
            Cello.Flagable(this);
        },
        
        /**
         * check wether cluster is misc aka agglomeration of small clusters or
         * unclustered items
         *
         * DEPRECATED: use `this.misc`
         */
        is_misc: function(){ 
            return this.misc;
        },

        /** Select the current cluster (got throw the collection)
         *
         * exclusif: if true then only this cluster will be selected
         */
        select: function(exclusif){
            if(exclusif){
                this.collection.set_selected([this]);
            }else{
                this.add_flag("selected");
            }
        },

        /** Select the curent or just clear selection if curent is already selected
         *
         * exlusif: if true then only this cluster will be selected
         */
        toggle_select: function(exclusif){
            var nb_selected = this.collection.selected.length;
            if(this.selected){
                if(exclusif && nb_selected >= 2){
                    // si selection exclusive (sans CTRL) et plus de deux selected
                    // alors on select JUSTE ce cluster
                    this.collection.set_selected([this]);
                } else {
                    // si non on unselect juste le cluster
                    this.remove_flag("selected");
                }
            } else {
                // if not select just select the current cluster
                this.select(exclusif);
            }
        },
        
        /** return true if (at least) one cluster is selected
         */
        some_selected: function(){
            return this.selected || this.collection.by_flag("selected");
        }, 
        
        /** Compute the elements membership
         */
        _compute_membership: function() {
            var _this_cluster = this;   //XXX: use _this_cluster instead of _this to avoid a strange bug on cillex, ask manu about, big mistery for now
            var cid = this.collection.clustering.cid;
            _(_this_cluster.members).each( function(collection){
                //console.log("****")
                //push the cluster in the clustering of each members models
                collection.each(function(model){
                    var cluster_member = {
                        cluster: _this_cluster,
                    };
                    // ^ note: this is a dictionnary to be able to associate scores in futur
                    if (model.clusters[cid]){
                        model.clusters[cid].push(cluster_member);
                    }else{
                        model.clusters[cid] = [cluster_member];
                    }
                    //model.trigger("change");
                    model.trigger("change:clusters");
                    model.trigger("change:clusters:" + cid);
                });
            });
        },
        
        /** Compute the cluster colors
         */
        _compute_colors_old: function(){
            //console.log("compute clusters color")
            var nb_clusters = this.collection.length;
            var value = this.collection.clustering.get('color_value'), 
                saturation = this.collection.clustering.get('color_saturation');
            var i = this.collection.indexOf(this);
            var color = [99, 99, 99];
            
            if(this.misc === false){
                 color = Cello.utils.hsvToRgb((i / nb_clusters * 360)|0, saturation, value);
            }
            this.color = color;
        },
        /** Compute the cluster colors
         */
        _compute_colors: function(v_used_color){

                if(this.misc === true) {
                    this.color = [99, 99, 99];
                    return;
                }

                var nb_clusters = this.collection.length;
                var nb_colors = 10;
                var value = this.collection.clustering.get('color_value');
                var saturation = this.collection.clustering.get('color_saturation');

                var i = this.collection.indexOf(this);

                var last_cluster_color_init = [0, 0, 0];
                var last_cluster_color = last_cluster_color_init;

                var maxCount = 0;
                var m = {};

                this.members.vs.each(function(node){
                    var last_node_cl_color=node.get('cl_color'); // check last node color

                    // count for the number of last_ind_cur occurences and find maximum
                    s_last_node_cl_color = last_node_cl_color.toString();
                    if( !m[s_last_node_cl_color] )
                    {
                        m[s_last_node_cl_color] = 1;
                    }
                    else
                    {
                        m[s_last_node_cl_color]++;
                    }
                    if(m[s_last_node_cl_color] > maxCount)
                    {
                        maxCount = m[s_last_node_cl_color];
                        last_cluster_color = last_node_cl_color ;
                    }
                });

                cluster_color = last_cluster_color;
                var ind_color = 0;

                while( _.isEqual(cluster_color, last_cluster_color_init) | (v_used_color.indexOf(cluster_color.toString()) != -1))
                {
                    // cluster_color = Cello.utils.hsvToRgb((1.0 * ind_color / nb_colors * 360) % 360|0, saturation, value);
                    cluster_color = Cello.utils.hsvToRgb((1.0 * (ind_color) * 222.23 ) % 360|0, saturation, value); // angle d'or
                    ind_color++;
                }

                v_used_color.push(cluster_color.toString());
                // console.log(i, nb_clusters, last_cluster_color, cluster_color.toString(), v_used_color, m);
                this.color = cluster_color;
        }
    },


    //static
    {
        active_flags: ["selected"]
    });
    
    /**
     *  A collection of clusters
     */
    Cello.ClustersList = Backbone.Collection.extend({
        model: Cello.Cluster,
        
        initialize: function(models, options){
            _this = this;

            Cello.get(this, 'selected', function(){return this.by_flag("selected");});
            Cello.assert(options.clustering, "options.clustering is needed");
            this.clustering = options.clustering;   // the clustering this clusters list belongs to
                        
            this.on('add remove reset', function(){
                var v_used_color = [];
                this.each(function(model){
                    model._compute_membership();
                    model._compute_colors(v_used_color);
                })
            });
            
            this.listenTo(this.clustering, 'change:color_saturation change:color_value', function(){
                var v_used_color = [];
                this.each(function(model){
                    model._compute_colors(v_used_color);
                })
            });
        },
        
        // Note: selection mechanism is very similar to the one in blocks with components and the one in Cello.DocList

        /** return true if (at least) one cluster is selected
         */
        some_selected: function(){
            return this.by_flag("selected").length > 0;
        },

        /** Select a cluster
         *
         * exclusif: if true then only this cluster will be selected
         */
        select: function(cluster, exclusif){
            //XXX plus d'interêt maintenant; à dégager je pense
            //TODO what if the cluster is not in the collection ?
            // si selected ET demande pas l'exclusivité alors que l'on est pas tout seul selected
            cluster.select(exclusif);
            //XXX doit-on garder ça maintenant que l'on gère avec les flags
            this.trigger("change:selected", cluster);
        },

        /** unselect all selected clusters
         */
        clear_selection: function(options){
            //XXX plus d'interêt maintenant; à dégager je pense à moins que ce ne soit un helper
            this.set_selected(null);
            // trigger an event to notify the selection change at doclist level
            if( !(options && options.silent)) {
                this.trigger("change:selected");
            }
        },

        /** Unselect a cluster */
        unselect: function(cluster){
            //XXX plus d'interêt maintenant; à dégager je pense
            //TODO what if the cluster is not in the collection ?
            cluster.remove_flag("selected");
            // triger an event to notify the selection change at block level
            this.trigger("change:selected");
        },
        
        /**
         * return true if there is a misc cluster in.clusters
         * TODO : add this to Clusters class
         */
        has_misc: function(){ 
            var is_misc = function(clust){return clust.is_misc();};
            return _.some(this.models, is_misc);
        },
        
        cluster: function(cid){
            return this.at(cid);
        },
    });

    /**
     *  A clustering (ie a set of Cluster) over a graph or a list of docs
     */
    //TODO: for now the only entry point to set the data is this.reset
    Cello.Clustering = Backbone.Model.extend({
        defaults: {
            clusters: null,    // the collection of clusters
            members : {}, //{name: {source: ..., id_field: ...}, ...} => 
                          // id_field is the id of clusters data where the sources ids for each cluster are recorded
                          // ex: {vs: {source: app.graph.vs, id_field: "vids"}}
            color_value: 80,
            color_saturation: 40 
        },

        ClusterLabelModel: Cello.ClusterLabel,
        ClusterModel: Cello.Cluster,
        ClustersCollection: Cello.ClustersList,

        initialize: function(attrs, options) {
            attrs = attrs  || {  };
            // Getters
            Cello.getset(this, 'members');
            Cello.getset(this, 'clusters');
            Cello.getset(this, 'color_value');
            Cello.getset(this, 'color_saturation');
            
            // override ClusterLabelModel, ClusterModel and ClustersList
            this.ClusterLabelModel = attrs.ClusterLabelModel || this.ClusterLabelModel;
            this.ClusterModel = attrs.ClusterModel || this.ClusterModel;
            this.ClustersCollection = attrs.ClustersCollection || this.ClustersCollection;
            
            var clusters_options = { // <Cluster> collection
                clustering:this, 
                model:this.ClusterModel
            }
            
           //initialize clusters list
            var clusters = new this.ClustersCollection([], clusters_options);
            this.set("clusters", clusters);
            
            Cello.FlagableCollection(this.clusters);
        },

        /** Reset the data from a std cluster model
         *
         * data = {
         *      clusters: [_list_of_clusters_],
         *       misc:_id_of_the_misc_if_any_
         * }
         * options = {
         *      members:{
         *          member_name: {
         *              source: source,          // collection that contains membres
         *              id_field: "field_name",  // name of the field in data.cluster to find member's ids
         *          }
         *      }
         * }
         */
        reset: function(data, options){
            var _this = this;
            
            var tmp_data = _(data).clone();
            
            if (options && options.members) {
                _.extend(this.members, options.members);
            }
             
            var members = this.members;
            
            // set the misc cluster
            _.map(tmp_data.clusters, function(cl){cl.misc = false;});
            if (tmp_data.misc > -1){
                tmp_data.clusters[tmp_data.misc].misc = true;
            }

            //build the cluster models and reset the clusters collection
            cluster_models = [];
            
            _.each(tmp_data.clusters, function(cl){
                //current cluster's members init
                cluster_members = {};
                //build the models for each members and add them to the clusters elem
                _.each(members, function(m, key){ // key 
                    //add new members collections
                    // clone et filtrage de la collection "source"
                    source_clone = m.source.clone();
                    source_filtered = source_clone.filter(function(element){
                        return _(cl[m.id_field]).contains(element.id);
                        //TODO optimisation is possible ^ this run in O(len(source_clone)*len(cl[m.id_field])) it can run in O(len(cl[m.id_field]))
                    })
                    source_clone.reset(                  // keep only ones of the current cluster
                        source_filtered,
                        {silent: true}
                    )
                    cluster_members[key] = source_clone; 
                });

                cluster_models.push(new _this.ClusterModel({
                    members: cluster_members,
                    misc: cl.misc
                }));
            });
            
            // reset the clusters collection
            this.clusters.reset(cluster_models);
            
            this.trigger("reset");
        },
        set_labels: function(data, options){

            this.clusters.each( function(cl,i){ cl.labels = data.labels[i] } )
                    
        },
    });

// == cellojs/utils.js ==

    Cello.utils = {};
    
    /**
     * Use Backbone Events listenTo/stopListening with any DOM element
     *
     * @param {DOM Element}
     * @return {Backbone Events style object}
     * 
     * You can use it like this:
     * view.listenTo(Cello.utils.asEvents(window), "resize", handler);
     **/
    Cello.utils.asEvents = function(el) {
        var args;
        return {
            on: function(event, handler) {
                if (args) throw new Error("this is one off wrapper");
                el.addEventListener(event, handler, false);
                args = [event, handler];
            },
            off: function() {
                el.removeEventListener.apply(el, args);
            } 
        };
    }
    
    /* converts int colors to css colors
     * >>> css_color( [200,122,10] )
     * "#C87A0A"
     */ 
    var _convert = function(c){ 
        c = '0'+c.toString(16);
        return c.substring(c.length-2);
    };
    Cello.utils.css_color = function( color ){
        var cssc = "#000000";
        if ( color ){
            cssc = "#" + _.map(color, _convert ).join('');
        }
        return cssc;
    };

    // FIXME webkit-only
    Cello.utils.css_gradient = function(c1, c2) {
        return "-webkit-linear-gradient("+ Cello.utils.css_color(c1)  +","+ Cello.utils.css_color(c2) +")";
    };

    Cello.utils.color_darker = function(color){
        var hsv = Cello.utils.rgbToHsv(color[0], color[1], color[2]);
        return Cello.utils.hsvToRgb(hsv[0],hsv[1],60);
    };

    /**
    * Converts HSV to RGB value.
    *
    * @param {Integer} h Hue as a value between 0 - 360 degrees
    * @param {Integer} s Saturation as a value between 0 - 100 %
    * @param {Integer} v Value as a value between 0 - 100 %
    * @returns {Array} The RGB values  EG: [r,g,b], [255,255,255]
    */
    Cello.utils.hsvToRgb = function(h, s, v) {

        s = s / 100;
        v = v / 100;

        var hi = Math.floor((h/60) % 6);
        var f = (h / 60) - hi;
        var p = v * (1 - s);
        var q = v * (1 - f * s);
        var t = v * (1 - (1 - f) * s);

        var rgb = [];

        switch (hi) {
            case 0: rgb = [v,t,p];break;
            case 1: rgb = [q,v,p];break;
            case 2: rgb = [p,v,t];break;
            case 3: rgb = [p,q,v];break;
            case 4: rgb = [t,p,v];break;
            case 5: rgb = [v,p,q];break;
        }

        var r = Math.min(255, (rgb[0]*256) | 0),
            g = Math.min(255, (rgb[1]*256) | 0),
            b = Math.min(255, (rgb[2]*256) | 0);

        return [r,g,b];
    };

    /**
    * Converts RGB to HSV value.
    *
    * @param {Integer} r Red value, 0-255
    * @param {Integer} g Green value, 0-255
    * @param {Integer} b Blue value, 0-255
    * @returns {Array} The HSV values EG: [h,s,v], [0-360 degrees, 0-100%, 0-100%]
    */
    Cello.utils.rgbToHsv = function(red, green, blue) {

        var r = (red / 255),
            g = (green / 255),
            b = (blue / 255);

        var min = Math.min(Math.min(r, g), b),
            max = Math.max(Math.max(r, g), b),
            delta = max - min;

        var value = max,
            saturation,
            hue;

        // Hue
        if (max == min) {
            hue = 0;
        } else if (max == r) {
            hue = (60 * ((g-b) / (max-min))) % 360;
        } else if (max == g) {
            hue = 60 * ((b-r) / (max-min)) + 120;
        } else if (max == b) {
            hue = 60 * ((r-g) / (max-min)) + 240;
        }

        if (hue < 0) {
            hue += 360;
        }

        // Saturation
        if (max === 0) {
            saturation = 0;
        } else {
            saturation = 1 - (min/max);
        }

        return [hue | 0, (saturation * 100) | 0 , (value * 100) | 0];
    };

    



    /* Add a CSS rule from JS
    */
    Cello.utils.addCSSRule = function(sel, prop, val) {
        var ss, rules;
        for(var i = 0; i < document.styleSheets.length; i++){
            ss    = document.styleSheets[i];
            rules = (ss.cssRules || ss.rules);
            var lsel  = sel.toLowerCase();

            for(var i2 = 0, len = rules.length; i2 < len; i2++){
                if(rules[i2].selectorText && (rules[i2].selectorText.toLowerCase() == lsel)){
                    if(val !== null){
                        rules[i2].style[prop] = val;
                        return;
                    }
                    else{
                        if(ss.deleteRule){
                            ss.deleteRule(i2);
                        }
                        else if(ss.removeRule){
                            ss.removeRule(i2);
                        }
                        else{
                            rules[i2].style.cssText = '';
                        }
                    }
                }
            }
        }

        ss = document.styleSheets[0] || {};
        if(ss.insertRule) {
            rules = (ss.cssRules || ss.rules);
            ss.insertRule(sel + '{ ' + prop + ':' + val + '; }', rules.length);
        }
        else if(ss.addRule){
            ss.addRule(sel, prop + ':' + val + ';', 0);
        }
    };

     Cello.utils.deparam = function (params, coerce) {
        var obj = {},
            coerce_types = { 'true': !0, 'false': !1, 'null': null };
          
        // Iterate over all name=value pairs.
        $.each(params.replace(/\+/g, ' ').split('&'), function (j,v) {
          var param = v.split('='),
              key = decodeURIComponent(param[0]),
              val,
              cur = obj,
              i = 0,
                
              // If key is more complex than 'foo', like 'a[]' or 'a[b][c]', split it
              // into its component parts.
              keys = key.split(']['),
              keys_last = keys.length - 1;
            
          // If the first keys part contains [ and the last ends with ], then []
          // are correctly balanced.
          if (/\[/.test(keys[0]) && /\]$/.test(keys[keys_last])) {
            // Remove the trailing ] from the last keys part.
            keys[keys_last] = keys[keys_last].replace(/\]$/, '');
              
            // Split first keys part into two parts on the [ and add them back onto
            // the beginning of the keys array.
            keys = keys.shift().split('[').concat(keys);
              
            keys_last = keys.length - 1;
          } else {
            // Basic 'foo' style key.
            keys_last = 0;
          }
            
          // Are we dealing with a name=value pair, or just a name?
          if (param.length === 2) {
            val = decodeURIComponent(param[1]);
              
            // Coerce values.
            if (coerce) {
              val = val && !isNaN(val)              ? +val              // number
                  : val === 'undefined'             ? undefined         // undefined
                  : coerce_types[val] !== undefined ? coerce_types[val] // true, false, null
                  : val;                                                // string
            }
              
            if ( keys_last ) {
              // Complex key, build deep object structure based on a few rules:
              // * The 'cur' pointer starts at the object top-level.
              // * [] = array push (n is set to array length), [n] = array if n is 
              //   numeric, otherwise object.
              // * If at the last keys part, set the value.
              // * For each keys part, if the current level is undefined create an
              //   object or array based on the type of the next keys part.
              // * Move the 'cur' pointer to the next level.
              // * Rinse & repeat.
              for (; i <= keys_last; i++) {
                key = keys[i] === '' ? cur.length : keys[i];
                cur = cur[key] = i < keys_last
                  ? cur[key] || (keys[i+1] && isNaN(keys[i+1]) ? {} : [])
                  : val;
              }
                
            } else {
              // Simple key, even simpler rules, since only scalars and shallow
              // arrays are allowed.
                
              if ($.isArray(obj[key])) {
                // val is already an array, so push on the next value.
                obj[key].push( val );
                  
              } else if (obj[key] !== undefined) {
                // val isn't an array, but since a second value has been specified,
                // convert val into an array.
                obj[key] = [obj[key], val];
                  
              } else {
                // val is a scalar.
                obj[key] = val;
              }
            }
              
          } else if (key) {
            // No value was defined, so set something meaningful.
            obj[key] = coerce
              ? undefined
              : '';
          }
        });
        return obj;
    }

    /** Helper to force piwik to register the current url
     *
     * This is useful to track 'pushState' that change page url without
     * the whole page.
     * tipicaly when you navigate with backbone router :
     * app.router.navigate("q/"+query);
     * Cello.utils.piwikTrackCurrentUrl();
    */
    Cello.utils.piwikTrackCurrentUrl = function(){
        if (!_.isUndefined(window._paq) && typeof (window._paq.push) == 'function') {
            //TODO: track document title
            //piwikTracker.setDocumentTitle(title)
            window._paq.push(['setCustomUrl', window.location.href]);
            window._paq.push(['trackPageView']);
        }
    };


    return Cello;
}))
