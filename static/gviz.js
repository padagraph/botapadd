
(function(root, factory) {
    // require.js
    if (typeof define === 'function' && define.amd) {
        // require.js impl
        define(['underscore','backbone','cello','tween','threejs','pdgconst'],
            function(_,Backbone,Cello,TWEEN,THREE,Const) {
              return factory(root, _,Backbone,Cello,TWEEN,THREE,Const);
        });
    }
    //FIXME: implements nodejs loading
    //wide scope
    else {
        root.Gviz = factory(root, _,Backbone,Cello,TWEEN,THREE,Const);
    }
}(this, function(root, _,Backbone,Cello,TWEEN,THREE,Const) {

// == gviz/TrackballControls.js ==

/**
 * @author Eberhard Graether / http://egraether.com/
 * @author Mark Lundin  / http://mark-lundin.com
 * @author Simone Manini / http://daron1337.github.io
 * @author Luca Antiga  / http://lantiga.github.io
 */

THREE.TrackballControls = function ( object, domElement ) {

    var _this = this;
    var STATE = { NONE: - 1, ROTATE: 0, ZOOM: 1, PAN: 2, TOUCH_ROTATE: 3, TOUCH_ZOOM_PAN: 4 };

    this.object = object;
    this.domElement = ( domElement !== undefined ) ? domElement : document;

    // API

    this.enabled = true;

    this.screen = { left: 0, top: 0, width: 0, height: 0 };

    this.rotateSpeed = 1.0;
    this.zoomSpeed = 1.2;
    this.panSpeed = 0.3;

    this.noRotate = false;
    this.noZoom = false;
    this.noPan = false;

    this.staticMoving = false;
    this.dynamicDampingFactor = 0.2;

    this.minDistance = 0;
    this.maxDistance = 5000;

    this.keys = [ 65 /*A*/, 83 /*S*/, 68 /*D*/ ];

    this.AUTO_ROTATE = false;


    this.autoRotateSpeed = 0.005;

    // internals

    this.target = new THREE.Vector3();

    var EPS = 0.000001;

    var lastPosition = new THREE.Vector3();

    var _state = STATE.NONE,
    _prevState = STATE.NONE,

    _eye = new THREE.Vector3(),

    _movePrev = new THREE.Vector2(),
    _moveCurr = new THREE.Vector2(),

    _lastAxis = new THREE.Vector3(),
    _lastAngle = 0,

    _zoomStart = new THREE.Vector2(),
    _zoomEnd = new THREE.Vector2(),

    _touchZoomDistanceStart = 0,
    _touchZoomDistanceEnd = 0,

    _panStart = new THREE.Vector2(),
    _panEnd = new THREE.Vector2();

    _MOUSEDOWN = false;

    // for reset

    this.target0 = this.target.clone();
    this.position0 = this.object.position.clone();
    this.up0 = this.object.up.clone();

    // events

    var changeEvent = { type: 'change' };
    var startEvent = { type: 'start' };
    var endEvent = { type: 'end' };


    // methods

    this.handleResize = function () {

        if ( this.domElement === document ) {

            this.screen.left = 0;
            this.screen.top = 0;
            this.screen.width = window.innerWidth;
            this.screen.height = window.innerHeight;

        } else {

            var box = this.domElement.getBoundingClientRect();
            // adjustments come from similar code in the jquery offset() function
            var d = this.domElement.ownerDocument.documentElement;
            this.screen.left = box.left + window.pageXOffset - d.clientLeft;
            this.screen.top = box.top + window.pageYOffset - d.clientTop;
            this.screen.width = box.width;
            this.screen.height = box.height;

        }

    };

    this.handleEvent = function ( event ) {

        if ( typeof this[ event.type ] == 'function' ) {

            this[ event.type ]( event );

        }

    };

    var getMouseOnScreen = ( function () {

        var vector = new THREE.Vector2();

        return function getMouseOnScreen( pageX, pageY ) {

            vector.set(
                ( pageX - _this.screen.left ) / _this.screen.width,
                ( pageY - _this.screen.top ) / _this.screen.height
            );

            return vector;

        };

    }() );

    var getMouseOnCircle = ( function () {

        var vector = new THREE.Vector2();

        return function getMouseOnCircle( pageX, pageY ) {

            vector.set(
                ( ( pageX - _this.screen.width * 0.5 - _this.screen.left ) / ( _this.screen.width * 0.5 ) ),
                ( ( _this.screen.height + 2 * ( _this.screen.top - pageY ) ) / _this.screen.width ) // screen.width intentional
            );

            return vector;

        };

    }() );

    this.rotateCamera = ( function() {

        var axis = new THREE.Vector3(),
            quaternion = new THREE.Quaternion(),
            eyeDirection = new THREE.Vector3(),
            objectUpDirection = new THREE.Vector3(),
            objectSidewaysDirection = new THREE.Vector3(),
            moveDirection = new THREE.Vector3(),
            angle;

        return function rotateCamera() {

            if( this.AUTO_ROTATE && !_MOUSEDOWN)
            {
                _moveCurr.x = _movePrev.x + this.autoRotateSpeed;
            }

            moveDirection.set( _moveCurr.x - _movePrev.x, _moveCurr.y - _movePrev.y, 0 );
            angle = moveDirection.length();

            if ( angle ) {

                _eye.copy( _this.object.position ).sub( _this.target );

                eyeDirection.copy( _eye ).normalize();
                objectUpDirection.copy( _this.object.up ).normalize();
                objectSidewaysDirection.crossVectors( objectUpDirection, eyeDirection ).normalize();

                objectUpDirection.setLength( _moveCurr.y - _movePrev.y );
                objectSidewaysDirection.setLength( _moveCurr.x - _movePrev.x );

                moveDirection.copy( objectUpDirection.add( objectSidewaysDirection ) );

                axis.crossVectors( moveDirection, _eye ).normalize();

                angle *= _this.rotateSpeed;
                quaternion.setFromAxisAngle( axis, angle );

                _eye.applyQuaternion( quaternion );
                _this.object.up.applyQuaternion( quaternion );

                _lastAxis.copy( axis );
                _lastAngle = angle;

            } else if ( ! _this.staticMoving && _lastAngle ) {

                _lastAngle *= Math.sqrt( 1.0 - _this.dynamicDampingFactor );
                _eye.copy( _this.object.position ).sub( _this.target );
                quaternion.setFromAxisAngle( _lastAxis, _lastAngle );
                _eye.applyQuaternion( quaternion );
                _this.object.up.applyQuaternion( quaternion );

            }

            _movePrev.copy( _moveCurr );

        };



    }() );


    this.zoomCamera = function () {

        var factor;

        if ( _state === STATE.TOUCH_ZOOM_PAN ) {

            factor = _touchZoomDistanceStart / _touchZoomDistanceEnd;
            _touchZoomDistanceStart = _touchZoomDistanceEnd;
            _eye.multiplyScalar( factor );

        } else {

            factor = 1.0 + ( _zoomEnd.y - _zoomStart.y ) * _this.zoomSpeed;

            if ( factor !== 1.0 && factor > 0.0 ) {

                _eye.multiplyScalar( factor );

                if ( _this.staticMoving ) {

                    _zoomStart.copy( _zoomEnd );

                } else {

                    _zoomStart.y += ( _zoomEnd.y - _zoomStart.y ) * this.dynamicDampingFactor;

                }

            }

        }

    };

    this.panCamera = ( function() {

        var mouseChange = new THREE.Vector2(),
        objectUp = new THREE.Vector3(),
        pan = new THREE.Vector3();

        return function panCamera() {

            mouseChange.copy( _panEnd ).sub( _panStart );

            if ( mouseChange.lengthSq() ) {

                mouseChange.multiplyScalar( _eye.length() * _this.panSpeed );

                pan.copy( _eye ).cross( _this.object.up ).setLength( mouseChange.x );
                pan.add( objectUp.copy( _this.object.up ).setLength( mouseChange.y ) );

                _this.object.position.add( pan );
                _this.target.add( pan );

                if ( _this.staticMoving ) {

                    _panStart.copy( _panEnd );

                } else {

                    _panStart.add( mouseChange.subVectors( _panEnd, _panStart ).multiplyScalar( _this.dynamicDampingFactor ) );

                }

            }

        };

    }() );

    this.checkDistances = function () {

        if ( ! _this.noZoom || ! _this.noPan ) {

            if ( _eye.lengthSq() > _this.maxDistance * _this.maxDistance ) {

                _this.object.position.addVectors( _this.target, _eye.setLength( _this.maxDistance ) );
                _zoomStart.copy( _zoomEnd );

            }

            if ( _eye.lengthSq() < _this.minDistance * _this.minDistance ) {

                _this.object.position.addVectors( _this.target, _eye.setLength( _this.minDistance ) );
                _zoomStart.copy( _zoomEnd );

            }

        }

    };

    this.update = function () {

        _eye.subVectors( _this.object.position, _this.target );

        if ( ! _this.noRotate ) {

            _this.rotateCamera();

        }

        if ( ! _this.noZoom ) {

            _this.zoomCamera();

        }

        if ( ! _this.noPan ) {

            _this.panCamera();

        }

        _this.object.position.addVectors( _this.target, _eye );

        _this.checkDistances();

        _this.object.lookAt( _this.target );

        if ( lastPosition.distanceToSquared( _this.object.position ) > EPS ) {

            _this.dispatchEvent( changeEvent );

            lastPosition.copy( _this.object.position );

        }

    };

    this.reset = function () {

        _state = STATE.NONE;
        _prevState = STATE.NONE;

        _this.target.copy( _this.target0 );
        _this.object.position.copy( _this.position0 );
        _this.object.up.copy( _this.up0 );

        _eye.subVectors( _this.object.position, _this.target );

        _this.object.lookAt( _this.target );

        _this.dispatchEvent( changeEvent );

        lastPosition.copy( _this.object.position );

    };

    // listeners

    function keydown( event ) {

        if ( _this.enabled === false ) return;

        window.removeEventListener( 'keydown', keydown );

        _prevState = _state;

        if ( _state !== STATE.NONE ) {

            return;

        } else if ( event.keyCode === _this.keys[ STATE.ROTATE ] && ! _this.noRotate ) {

            _state = STATE.ROTATE;

        } else if ( event.keyCode === _this.keys[ STATE.ZOOM ] && ! _this.noZoom ) {

            _state = STATE.ZOOM;

        } else if ( event.keyCode === _this.keys[ STATE.PAN ] && ! _this.noPan ) {

            _state = STATE.PAN;

        }

    }

    function keyup( event ) {

        if ( _this.enabled === false ) return;

        _state = _prevState;

        window.addEventListener( 'keydown', keydown, false );

    }

    function mousedown( event ) {

        if ( _this.enabled === false ) return;


        _MOUSEDOWN = true;

        event.preventDefault();
        event.stopPropagation();

        if ( _state === STATE.NONE ) {

            _state = event.button;

        }

        if ( _state === STATE.ROTATE && ! _this.noRotate ) {

            _moveCurr.copy( getMouseOnCircle( event.pageX, event.pageY ) );
            _movePrev.copy( _moveCurr );

        } else if ( _state === STATE.ZOOM && ! _this.noZoom ) {

            _zoomStart.copy( getMouseOnScreen( event.pageX, event.pageY ) );
            _zoomEnd.copy( _zoomStart );

        } else if ( _state === STATE.PAN && ! _this.noPan ) {

            _panStart.copy( getMouseOnScreen( event.pageX, event.pageY ) );
            _panEnd.copy( _panStart );

        }

        document.addEventListener( 'mousemove', mousemove, false );
        document.addEventListener( 'mouseup', mouseup, false );

        _this.dispatchEvent( startEvent );

    }

    function mousemove( event ) {

        if ( _this.enabled === false ) return;

        event.preventDefault();
        event.stopPropagation();

        if ( _state === STATE.ROTATE && ! _this.noRotate ) {

            _movePrev.copy( _moveCurr );
            _moveCurr.copy( getMouseOnCircle( event.pageX, event.pageY ) );

        } else if ( _state === STATE.ZOOM && ! _this.noZoom ) {

            _zoomEnd.copy( getMouseOnScreen( event.pageX, event.pageY ) );

        } else if ( _state === STATE.PAN && ! _this.noPan ) {

            _panEnd.copy( getMouseOnScreen( event.pageX, event.pageY ) );

        }

    }

    function mouseup( event ) {

        if ( _this.enabled === false ) return;

        _MOUSEDOWN = false;

        event.preventDefault();
        event.stopPropagation();

        _state = STATE.NONE;

        document.removeEventListener( 'mousemove', mousemove );
        document.removeEventListener( 'mouseup', mouseup );
        _this.dispatchEvent( endEvent );

    }

    function mousewheel( event ) {

        if ( _this.enabled === false ) return;

        event.preventDefault();
        event.stopPropagation();

        var delta = 0;

        if ( event.wheelDelta ) {

            // WebKit / Opera / Explorer 9

            delta = event.wheelDelta / 40;

        } else if ( event.detail ) {

            // Firefox

            delta = - event.detail / 3;

        }

        _zoomStart.y += delta * 0.01;
        _this.dispatchEvent( startEvent );
        _this.dispatchEvent( endEvent );

    }

    function touchstart( event ) {

        if ( _this.enabled === false ) return;

        switch ( event.touches.length ) {

        case 1:
            _state = STATE.TOUCH_ROTATE;
            _moveCurr.copy( getMouseOnCircle( event.touches[ 0 ].pageX, event.touches[ 0 ].pageY ) );
            _movePrev.copy( _moveCurr );
            break;

        case 2:
            _state = STATE.TOUCH_ZOOM_PAN;
            var dx = event.touches[ 0 ].pageX - event.touches[ 1 ].pageX;
            var dy = event.touches[ 0 ].pageY - event.touches[ 1 ].pageY;
            _touchZoomDistanceEnd = _touchZoomDistanceStart = Math.sqrt( dx * dx + dy * dy );

            var x = ( event.touches[ 0 ].pageX + event.touches[ 1 ].pageX ) / 2;
            var y = ( event.touches[ 0 ].pageY + event.touches[ 1 ].pageY ) / 2;
            _panStart.copy( getMouseOnScreen( x, y ) );
            _panEnd.copy( _panStart );
            break;

        default:
            _state = STATE.NONE;

        }
        _this.dispatchEvent( startEvent );


    }

    function touchmove( event ) {

        if ( _this.enabled === false ) return;

        event.preventDefault();
        event.stopPropagation();

        switch ( event.touches.length ) {

        case 1:
            _movePrev.copy( _moveCurr );
            _moveCurr.copy( getMouseOnCircle(  event.touches[ 0 ].pageX, event.touches[ 0 ].pageY ) );
            break;

        case 2:
            var dx = event.touches[ 0 ].pageX - event.touches[ 1 ].pageX;
            var dy = event.touches[ 0 ].pageY - event.touches[ 1 ].pageY;
            _touchZoomDistanceEnd = Math.sqrt( dx * dx + dy * dy );

            var x = ( event.touches[ 0 ].pageX + event.touches[ 1 ].pageX ) / 2;
            var y = ( event.touches[ 0 ].pageY + event.touches[ 1 ].pageY ) / 2;
            _panEnd.copy( getMouseOnScreen( x, y ) );
            break;

        default:
            _state = STATE.NONE;

        }

    }

    function touchend( event ) {

        if ( _this.enabled === false ) return;

        switch ( event.touches.length ) {

        case 1:
            _movePrev.copy( _moveCurr );
            _moveCurr.copy( getMouseOnCircle(  event.touches[ 0 ].pageX, event.touches[ 0 ].pageY ) );
            break;

        case 2:
            _touchZoomDistanceStart = _touchZoomDistanceEnd = 0;

            var x = ( event.touches[ 0 ].pageX + event.touches[ 1 ].pageX ) / 2;
            var y = ( event.touches[ 0 ].pageY + event.touches[ 1 ].pageY ) / 2;
            _panEnd.copy( getMouseOnScreen( x, y ) );
            _panStart.copy( _panEnd );
            break;

        }

        _state = STATE.NONE;
        _this.dispatchEvent( endEvent );

    }

    function contextmenu( event ) {

        event.preventDefault();

    }

    this.dispose = function() {

        this.domElement.removeEventListener( 'contextmenu', contextmenu, false );
        this.domElement.removeEventListener( 'mousedown', mousedown, false );
        this.domElement.removeEventListener( 'mousewheel', mousewheel, false );
        this.domElement.removeEventListener( 'DOMMouseScroll', mousewheel, false ); // firefox

        this.domElement.removeEventListener( 'touchstart', touchstart, false );
        this.domElement.removeEventListener( 'touchend', touchend, false );
        this.domElement.removeEventListener( 'touchmove', touchmove, false );

        document.removeEventListener( 'mousemove', mousemove, false );
        document.removeEventListener( 'mouseup', mouseup, false );
        document.removeEventListener( 'mouseout', mouseup, false );

        window.removeEventListener( 'keydown', keydown, false );
        window.removeEventListener( 'keyup', keyup, false );

    }

    this.domElement.addEventListener( 'contextmenu', contextmenu, false );
    this.domElement.addEventListener( 'mousedown', mousedown, false );
    this.domElement.addEventListener( 'mousewheel', mousewheel, false );
    this.domElement.addEventListener( 'DOMMouseScroll', mousewheel, false ); // firefox

    this.domElement.addEventListener( 'touchstart', touchstart, false );
    this.domElement.addEventListener( 'touchend', touchend, false );
    this.domElement.addEventListener( 'touchmove', touchmove, false );

    window.addEventListener( 'keydown', keydown, false );
    window.addEventListener( 'keyup', keyup, false );

    this.handleResize();

    // force an update at start
    this.update();

};

THREE.TrackballControls.prototype = Object.create( THREE.EventDispatcher.prototype );
THREE.TrackballControls.prototype.constructor = THREE.TrackballControls;

// == gviz/gviz.js ==

/**
 * Requires:
 *   underscore # as _
 *   backbone   # as Backbone
 *   threejs    # as THREE
 *   cello_core # as Cello
 *
 * Usage:
 * >>>
 models.vizmodel= new Models.GVizModel({});

 // creates visualisation object
 views.vz_threejs_main = new gviz.ThreeViz({ el: "#vz_threejs_main",
 model : models.vizmodel,
 width :$('#vz_threejs_main').width(),
 height: $('#vz_threejs_main').height(),
 wnode_scale:wnode_scale, // node scaling function
 })
 .enable()
 .animate(); // rendering loop
**/


/*
 * TODO :
 *  material transition, smooth effect
 *  text background
 * */


// FIXME : three is not amd-ready
var THREE = window.THREE;
var TWEEN = window.TWEEN

var hsvToRgb = Cello.utils.hsvToRgb,
rgbToHsv = Cello.utils.rgbToHsv;


/** split text by ' '
 * TODO handle \n
 * return : [ text, rest ]
 **/
var _split = function(text, max_length, min_words){
    min_words = min_words | 1;

    var index = -1,
    count = 0;
    var t = text.split(' ');
    var size= t.length;

    for (var i in t){
        i = parseInt(i);
        count += t[i].length ;
        index = i;
        if ( (count +i ) > max_length && index>=min_words){
            break;
        }
        index = index+1;
    }

    return [ t.slice(0,index).join(' '),
             t.slice(index).join(' ')
           ];
};


var get_font = function(font, add){
     
    var fontsize = parseInt(/([0-9]*)px/.exec(font)[1])
    fontsize = fontsize + parseInt(add);
    return font.replace( /[0-9]+(.*)/, fontsize + "$1" )

};


var set_context_style = function(context, key, value){
    // value is a color3Int
    if ( _.isArray(value) && value.length == 3 ){
        style = "rgb(" + value.join(',') + ")";
    }

    else if ( _.isArray(value) && value.length == 2 ){

        style = context.createLinearGradient(-0.5, -0.5,0.5, 0.5);
        for (var i in value)
            style.addColorStop(i, value[i]);
    }
    else if ( value.substring(0,9) == "gradient:" ) {
        var color = new THREE.Color(value.substring(9));

        var hsv = rgbToHsv(color.r, color.g, color.b),
        rgb = hsvToRgb(hsv[0], hsv[1], 60),
        hexrgb = "rgb(" + rgb.join(',') + ")";

        style = context.createLinearGradient(-0.5, -0.5,0.5, 0.5);
        style.addColorStop(0, hexrgb);
        style.addColorStop(1, color.getStyle() );
    }
    // inner sprite linear gradient
    else { // plain
        style = value;
    }
    context[key] = style;
}

var get_text_lines = function(node, material){

    var text_lines = [],
        line = [],
        token = {},
        form = "",
        end_line = false,
        label = [ {form : node.label, css : ".normal-font"} ];

    if ( node.format_label)
        label = node.format_label(material.textLength);
        
    if ( label === undefined ) return [];

    //init of the first token and form if next token exists
    if(label.length){
        token = label[0];
        form += token.form;
    }

    var split_length = material.line_max_length;

    while (label.length || form.length){

        var splitted =  _split( form, split_length, 1);
        var text = splitted[0],
        rest = splitted[1];

        if(!rest){
            rest = "";
        }

        if( !text.length && rest.length){
            text = rest;
            rest = "";
        }

        split_length -= text.length;

        //if we can't add the new text to the line we push the line and push the text in a new one
        if (split_length <= 0){

            if ( text_lines.length == 0 ){
                if( line.length > 0 )
                    text_lines.push(line);
            }
            else if( line.length > 0 )
                text_lines.push(line);

            line = [];
            split_length = material.line_max_length;
        }

        //pushing of the text in the current line
        if (text && text.length)
            line.push( { 'form':text, 'css':token.css } );

        if ( rest.length && text.length ){
            text_lines.push(line);
            form = rest;
            split_length = material.line_max_length;
            line = [];
            continue;
        }
        //the next form is the rest combined with the next token's form
        if(rest.length <= split_length){

            //add rest to the current line
            if (rest.length){
                line.push( { 'form':rest, 'css':token.css } );
                rest = "";
                //updating of the line's size
                split_length -= rest.length;
            }

            //push line if line complete
            if(split_length === 0){
                text_lines.push(line);
                line = [];
                split_length = line_max_length;
            }

            if ( label.length ){
                label.shift();
            }

            //reinit of the token and form if next token exists
            if(label.length){
                token = label[0];
                form = token.form;
            }else{
                form = "";
            }


        }else{
            form = rest;
        }

    }

    if(line.length){
        text_lines.push(line);
    }
    
    return text_lines;

}

var gviz = { Layout: {} };

gviz.hexcolor = function(color){
    var _color =  _.map(color, function(e) {return e/255});
    return new THREE.Color( _color[0],_color[1],_color[2]).getHex();
};

gviz.csscolor = function(color){
    var _color =  _.map(color, function(e) {return e/255});
    return new THREE.Color( _color[0],_color[1],_color[2]).getStyle();
};



/*
  Features

  * no selection on mouseup after rotation

  */


/**
 * @param viz_div_id: <str> DOM id of element that will contain the vizu
 * @param parameters : {} parameters and callback functions
 *
 * *Parameters:*
 * width : <int> width of canvas
 * height : <int> height of canvas
 *
 * renderNode : <void>function( threejs_view_viz, particle_pid, canvas_context )
 *              draw a vertex/partcle on the canvas
 * wnode_scale: <int>function(jsnode)
 *              return scale of vertex/particule (1 by default for all node).
 *
 * setgraph_callback : <void>function(threejs_view_viz)
 *               called after wmodel and scene are built.
 */
gviz.DEFAULTS = {

    show_nodes : true,
    show_edges : true,
    show_text  : true,
    show_images  : true,

    background_color : 0xAAAAAA,
    user_font_size : 3, //[0, 25]
    user_vtx_size : 1, // 
    initial_size : 10, // 
    initial_z    : 1400,

    raycaster_precision : 2,
    adaptive_zoom : false, // adjust particules size on zoom

    use_material_transitions: true,
    force_position_no_delay : false, // no tween on positions
    node_material_transition_delay: 100,
    edge_material_transition_delay: 200,
    
    auto_rotate : false, // auto_rotate

    debug : false
};

gviz.ThreeViz = Backbone.View.extend({

    initialize: function(attributes){
        var _this = this;

        attrs = _.extend({}, gviz.DEFAULTS, attributes);
        if ( ! attrs['el'] )
            attrs['el'] = "#vz_threejs_main" + Math.round(Math.random()*10000);

        //this.el = attrs['el'];
        // view attrs
        this.show_nodes = attrs['show_nodes'];
        this.show_edges = attrs['show_edges'];
        this.show_images = attrs['show_images'];
        this.show_text  = attrs['show_text'] ;

        this.DISPLAY_EDGE_LABEL  = attrs['DISPLAY_EDGE_LABEL'] || true ;
        this.DISPLAY_ARROW_INIT  = attrs['DISPLAY_ARROW_INIT'] || false;
        this.DISPLAY_ARROW_END  = attrs['DISPLAY_ARROW_END'] || false;
        this.AUTO_FOCUS  = attrs['AUTO_FOCUS'] ;
        this.ENABLE_FOG  = attrs['ENABLE_FOG'] ;
        this.auto_rotate  = attrs['auto_rotate'] || false ;

        this.initial_size  = attrs['initial_size'] ;
        this.initial_z  = attrs['initial_z'] ;
        this.user_vtx_size  = attrs['user_vtx_size'] ;
        this.user_font_size  = attrs['user_font_size'] ;
        this.background_color  = attrs['background_color'] ;

        // callable( viz, pid, context )
        this.render_node = attrs['render_node'] || gviz.ThreeVizHelpers.render_node;
        this.wnode_scale = attrs['wnode_scale'] || gviz.ThreeVizHelpers.wnode_scale;

        // picking
        this.raycaster_precision = attrs['raycaster_precision']; // RayCaster.linePrecision

        // prevents Tweens transition on positions
        this.force_position_no_delay = attrs['force_position_no_delay'];

        // materials
        this.edge_materials = {};
        this.node_materials = {};

        // material transitions
        this.use_material_transitions       = attrs['use_material_transitions'];
        this.node_material_transition_delay = attrs['node_material_transition_delay'];
        this.edge_material_transition_delay = attrs['edge_material_transition_delay'];

        // default materials
        var _materials = function( materials, mtype ){
            _.each( materials , function(m){
                var name = _.keys(m)[0];
                _this.add_material(mtype, name, m[name]);
            });
        };
        _materials( gviz.ThreeVizHelpers.edge_materials, 'edge');
        _materials( gviz.ThreeVizHelpers.node_materials, 'node');

        // materials in attrs
        if ( attrs.materials ){
            if (attrs.materials.node)
                _materials( attrs.materials.node, 'node');
            if (attrs.materials.edge)
                _materials( attrs.materials.edge, 'edge');
        }

        this.adaptive_zoom = attrs.adaptive_zoom;
        this.debug = attrs.debug;

        // Width an height
        this._width = attrs['width'] || -1;     // < 0 means that we take the width of the $el
        this._height = attrs['height'] || -1;
        Cello.get(this, "width", function(){
            var w = _this.$el.width();
            if (w <= 0 ) w = $(window).width();
            return _this._width > 0 ? _this._width : w ;
        });
            
        Cello.get(this, "height", function(){
            var w = _this.$el.height();
            if (w <= 0 ) w = $(window).height();
            return _this._height > 0 ? _this._height : w;
        });

        this.clear_color = new THREE.Color(attrs['background_color']);

        // private variables
        this._inited = false;       // true if the view has been well initialized (_init)

        this.wnodes = [];
        this.wedges = [];
        this.wnidx = {};
        this.weidx = {};

        this.WINDOWVISIBLE = true; // whether the window is visible
        this.MOUSEDOWN = false;
        this.MOUSEHASMOVED = false;
        this.ANIMATE = false;
        this.intersected = null;

        // node drawing function factory
        this.program_factory = function(wnode) {
            var render = _this.render_node;
            return function(ctx){render( _this, wnode, ctx);  };
        };


        return this;
    },

    /** Setup html container and adds events listener on divs
     *
     * @return viz
     */
    enable: function(){
        // init environment
        var _this = this,
        mouse = new THREE.Vector2(),
        camera, controls, scene, renderer, stats;

        camera = new THREE.PerspectiveCamera( 40, this.width / this.height, 10, 10000 );
        camera.position.x = 0;
        camera.position.y = 0,
        camera.position.z = this.initial_z;

        scene = new THREE.Scene();
        scene.autoUpdate = true;

        controls = new THREE.TrackballControls(camera, this.el);
        controls.rotateSpeed = 5;
        controls.zoomSpeed = 4;
        controls.panSpeed = 3;
        controls.noZoom = false;
        controls.noPan = false;
        controls.staticMoving = true;
        controls.dynamicDampingFactor = 0.3;
        controls.minDistance = 50;
        //custom
        controls.autoRotateSpeed = 0.002;
        controls.AUTO_ROTATE = this.auto_rotate

        // init renderer
        renderer = new gviz.GraphRenderer( { antialias: true } );
        renderer.sortObjects = true;
        renderer.setSize(this.width, this.height);

        renderer.DISPLAY_EDGE = this.show_edges;
        renderer.DISPLAY_EDGE_LABEL = true; // display text on edges
        renderer.DISPLAY_ARROW_INIT = true; // display arrow init
        renderer.DISPLAY_ARROW_END = true; // display arrow end
        renderer.ENABLE_FOG = true;


        // save it as attributs
        this.camera = camera;
        this.controls = controls;
        this.scene = scene;
        this.renderer = renderer;

        this.changeFocusSpeed = 1000;
        this.changeCoordSpeed = 800;
        this.fogDistance = 800;

        // Bind events
        _.bindAll(this, 'animate', 'render', 'resize_rendering');
        _.bindAll(this, 'onMouseMove', 'onMouseUp', 'onMouseDown', 'onMouseOut', 'onDblClick');

        // estimate if window is visible with focus
        //TODO: it is now possible to do better :
        // http://stackoverflow.com/questions/12536562/detect-whether-a-window-is-visible
        this.listenTo(Cello.utils.asEvents(window), 'focus', function(e){
            _this.WINDOWVISIBLE = true;
        });
        this.listenTo(Cello.utils.asEvents(window), 'blur', function(e){
            _this.WINDOWVISIBLE = false;
        });

        // model events
        this.listenTo(this.model, 'change', function(){ _this.request_animation(); } );
        this.listenTo(this.model.vs, 'remove', function(vtx){

            _this.stopListening(vtx, "change:coords");

        } );

        renderer.domElement.addEventListener('mousemove', this.onMouseMove, false);
        renderer.domElement.addEventListener('mousedown', this.onMouseDown, false);
        renderer.domElement.addEventListener('mouseout', this.onMouseOut, false);
        renderer.domElement.addEventListener('mouseup', this.onMouseUp, false);
        renderer.domElement.addEventListener('dblclick', this.onDblClick, false);
        var mousewheel = function(event){
            _this.request_animation(1000);
        }
        renderer.domElement.addEventListener('mousewheel', mousewheel, false );
        renderer.domElement.addEventListener('DOMMouseScroll', mousewheel, false );
        renderer.domElement.addEventListener( 'touchstart', function(e){
            _this.MOUSEDOWN = true;
            _this.request_animation();
        }, false );
        renderer.domElement.addEventListener( 'touchend', function(e){ _this.MOUSEDOWN = false }, false );

        var hascss = renderer.domElement.className.split(" ").indexOf("pdg-renderer");
        if (hascss < 0) {
            //this.resize_rendering();
            this.renderer.domElement.className += " pdg-renderer";
        }
        
        this.el.appendChild(renderer.domElement);

        // add event listener to resize the rendering if $el resize
        if(this._width < 0 || this._height < 0 ){
            //Note: the binding is done only if the height or width aren't setted
            // (elsewhere there is no use to resize)
            this.listenTo(Cello.utils.asEvents(window), 'resize', this.resize_rendering);
        }

        this.set_clear_color(this.clear_color.getStyle());


        this.renderer = renderer
        this._inited = true; 
        
        return this;
    },

    set_clear_color: function(color){
        var clear_color = new THREE.Color(color);
        this.background_style = clear_color.getStyle();
        this.renderer.setClearColor(clear_color.getHex());
        $(this.renderer.domElement).css("background-color", clear_color.getStyle() );
        this.clear_color = clear_color;
    },

    /** Called when the window is resized */
    resize_rendering: function() {

        if(!this._inited) return;

        var width = this.width,
            height = this.height;

        this.controls.handleResize(); // bug when resizing canvas instead of window
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
        this.request_animation();
    },


    /** removes all nodes and edges from the scene
     * Actually all object that have '_type' property
     */
    clean: function(){
        var children = this.scene.children;
        var scene = this.scene;
        var obj, i;

        for ( i = children.length - 1; i >= 0 ; i -- ) {
            obj = children[ i ];
            if ( _.has(obj,"_type")) {
                scene.remove(obj);
            }
        }

        this.wnodes = [],
        this.wedges = [];
        this.wnidx  = {};
        this.weidx  = {};

        this.request_animation();
    },

    /** create visualisation model from Graph
        reset graph/clean scene first
        @return viz
    */

    append_node: function(node){
        var _this = this;
        var wnode = new THREE.Sprite();
        _this.wnidx[node.id] = wnode;

        wnode.position = new THREE.Vector3(0,0,0);
        wnode.scale.x = wnode.scale.y = _this.wnode_scale(node);
        wnode._type = "vertex";
        wnode._node = node;
        wnode._edges = [];
        wnode.program_material = _this.get_material(_this.node_materials, node);
        wnode.material = new THREE.SpriteCanvasMaterial({
            program: _this.program_factory(wnode),
        });

        _this.listenTo(node, "change:coords", function() {
            _this.setPosition(wnode.position, node.get('coords'), this.changeCoordSpeed, TWEEN.Easing.Elastic.OutIn);
        });

        _this.listenTo(node, "change:color",  function(){
                            wnode.material_needs_update = true;
                            _this.request_animation();
        });
       
        _this.listenTo(node, "rmflag", function() {
            wnode.material_needs_update = true;
            _this.request_animation();
        });

        _this.listenTo(node, "addflag", function() {
            wnode.material_needs_update = true;
            _this.request_animation();
        });

        _this.wnodes.push( wnode );
        _this.scene.add( wnode );
    },

    remove_node: function(node){
        var wnode = this.wnidx[node.id];
        this.scene.remove( wnode );
        delete this.wnidx[node.id];
        this.request_animation();
    },

    remove_edge: function(edge){
        var line = this.weidx[edge.id]
        this.scene.remove(line);
        delete this.weidx[edge.id];
        console.log('gviz remove edge', edge)
        this.request_animation();
    },


    append_edge: function(edge){

        if (edge.id in this.weidx)
            return;

        var _this = this;
        var wsrc = _this.wnidx[edge.source.id],
            wtgt = _this.wnidx[edge.target.id];

        if (wsrc === undefined || wtgt === undefined ) { console.log( "edge without source or target" ); return ; }

        var geometry = new THREE.Geometry();

        geometry.vertices.push(wsrc.position.clone());
        geometry.vertices.push(wtgt.position.clone());

        var easing = TWEEN.Easing.Circular.In;

        var material = new THREE.LineBasicMaterial({}),
        line = new THREE.Line( geometry, material );

        line._type = "edge";
        line._edge = edge;

        _this.set_line_material(line);

        this.weidx[edge.id] = line;
        _this.scene.add( line );

        // edge events

        var complete = function(){
            geometry.computeBoundingSphere();
            _this.set_line_material(line);
        }
        
        _this.listenTo(edge.source, "change:coords", function() {
            if( edge.collection)
                _this.setPosition(geometry.vertices[0], edge.source.get('coords'), this.changeCoordSpeed, easing , complete);
        });

        _this.listenTo(edge.target, "change:coords", function() {
            if( edge.collection)
                _this.setPosition(geometry.vertices[1], edge.target.get('coords'), this.changeCoordSpeed, easing , complete );
        });

        _this.listenTo(edge, "rmflag", function(e, options) {
            //console.log(e, options)
            _this.set_line_material(line);
            _this.request_animation();
        });

        _this.listenTo(edge, "addflag", function(flag, e, options) {
            //console.log(flag, e, options)
            _this.set_line_material(line);
            _this.request_animation();
        });
    },

    /*  Materials  */

    add_material: function (otype, name, material){
        return this.set_material(otype, name, material)
    },

    set_material: function (otype, name, material) {
        /* set a material TODO: desc font, ...
         * otype : 'node' or 'edge'
         * name  : material name matching a flag
         * material : {} material properties
         all properties can be a function(node/edge)
         // sprite  & text
         'scale'      : <float>
         'opacity'    : <float>[0,1]
         // sprite
         'shape'      : <str> in ['circle', 'square', 'triangle']
         'image'      : <str> id in img html element
         'fillStyle'  : <color> for plain , [<color>, ..] for gradient
         'strokeStyle': <color> css style
         'lineWidth'  : <float>
         // text
         'font'       : <str> css style 'normal 12px sans',
         'fontColor'  : <color> '#333', ...
         'fontScale'  : <float>
         * */
        var mtypes = ['node', 'edge'];
        Cello.assert( _.indexOf(mtypes, otype) > -1,
                      ["Wrong material type", mtypes]
                    );
        Cello.log("GViz: Adding material", otype, name)
        if( name in this[otype+'_materials'] ){
            _.extend( this[otype+'_materials'][name], material );
        }
        else {
            this[otype+'_materials'][name] = material;
        }

    },

    set_materials: function(otype, materials){
        /*set a list of materials
         * otype : 'node' or 'edge'
         materials : {} list of materials {name : material , ...}
         * */
        _this = this;
        var mtypes = ['node', 'edge'];
        Cello.assert( _.indexOf(mtypes, otype) > -1,
                      ["Wrong material type", mtypes]
                    );

        _.each(materials, function(material){
            var name = _.keys(material)[0];
            _this.set_material(otype, name, material[name]);
        });
    },

    get_material: function(materials, obj){
        /**
         * get a material from flags
         * materials : material list
         * obj : vertex or edge
         */

        var flags = obj.flags || {};
        var names = _.filter(_.keys(materials), function(name) { return name.substring(0,1) == "." });
        var material = _.extend({}, materials.default );
        var apply = true;

        // sort names from the more generic to the more specific
        names = _.sortBy(names, function(name){
            return name.split(".").length;
        });
        // apply new material
        _.each(names, function(name){
            css_classes = _(name.split(".")).rest(1);

            // if one of the css_classes is not contained in the object flags we don't apply the css_material
            apply = true;
            for( i = 0; i < css_classes.length; i++){
                if ( ! _(flags).contains(css_classes[i]) ){
                    apply = false;
                    break;
                };
            };

            // apply css_material if needed
            if ( apply ) material = _.extend( material, materials[name]);
        });

        // parse material
        for (k in material){
            var value = material[k];
            if ( _.isString(value) && value.substring(0,4) == 'get:'){
                var attr = value.substring(4);
                value = obj.get(attr);
            }
            else if ( _.isString(value) && value.substring(0,5) == 'prop:'){
                var attr = value.substring(5);
                value = obj.properties.get(attr);
            }
            else if ( _.isFunction(value) ){
                try {
                    value = value(obj);
                } catch(Exception) { value = 0 }
            }
            material[k] = value;
        }

        // precomputed text lines
        if (obj.nodetype)
            material.text_lines = get_text_lines( obj, material );
        
        if (material.shape == null) material.shape='circle';
        
        material.id = obj.id;
        return material;
    },

    set_node_material: function(node){
        /**
         * Update wnode material
         * node : graph vertex object
         *
         * TODO : apply tween transition here ?
         *
         **/
        var wnode = this.wnidx[node.id];
        var material = this.get_material(this.node_materials, node);
        //wnode.scale.x = wnode.scale.y = material.scale;

        // transitions
        // TODO only some property are able to get transition
        var transitions = {
            opacity : material.opacity,
            scale: material.scale,
            fontScale: material.fontScale,
            //fillStyle : node.get('color')
        }

        if (this.use_material_transitions && this.node_material_transition_delay > 0){
            material.opacity = wnode.program_material.opacity;
            material.scale = wnode.program_material.scale;
            material.fontScale = wnode.program_material.fontScale;
            //material.fillStyle = wnode.program_material.fillStyle;
            
            tween = new TWEEN.Tween(material)
                .to(transitions, this.node_material_transition_delay)
                .start();
        }
        else {
            for (k in transitions)
                material[k] = transitions[k];
        }

        wnode.program_material = material;
        wnode.material_needs_update = false;
    },

    set_line_material: function(line){

        var edge = line._edge;

        if (edge == null ) return ;
        
        var material = this.get_material(this.edge_materials, edge);

        var vertexColors = null;
        var color;

        if ( _.isArray(material.color) && material.color.length == 2 ){
            color = [ new THREE.Color(material.color[0]),new THREE.Color(material.color[1]) ];
            vertexColors = THREE.VertexColors;
        }
        else
            color = new THREE.Color(material.color);

        // line flags
        line.material.linecap  = material.linecap;  // "butt", "round", "square"
        line.material.linejoin = material.linejoin; // "round", "bevel", "miter"
        line.material.lineType = material.lineType; // plain , dashed
        line.material.dashSize = material.dashSize; 
        line.material.gapSize  = material.gapSize; 
        
        // use vertex colors flag
        line.material.vertexColors = vertexColors;
        // vertex color
        line.geometry.colors = color;
        // plain color (mean color from vertices)
        line.material.color = color;
        // label display
        line.material.label_visible = material.label_visible;
        line.material.font = material.font;
        line.material.fontFillStyle = material.fontFillStyle;
        line.material.textAlign = material.textAlign;
        // orientation display
        line.material.orientation_visible = material.orientation_visible;

        

        // transitions
        var transition = {
            opacity : material.opacity,
            linewidth: material.lineWidth
        }

        if (this.use_material_transitions && this.edge_material_transition_delay > 0){
            tween = new TWEEN.Tween(line.material)
                .to(transition, this.edge_material_transition_delay)
                .start();
        }
        else {
            for (k in transition)
                line.material[k] = transition[k];
        }

    },

    /** set the position of an object with or without  animation
     *
     * target: the object to move  (node or edge) could be also light or camera
     * coords: the new final coords
     * delay: transition time
     * easing: transition function (see TWEEN easing fct)
     * complete: callback function when completed see TWEEN.onComplete
     */
    setPosition: function(target, coords, delay, easing, complete){

        if (this.force_position_no_delay)
            delay = 0;

        var complete = complete || null;
        var easing = easing || TWEEN.Easing.Circular.In;

        var position = {}
        if (_.isArray(coords)){
            coords.length == 3 | coords.push(0);
            position.x = coords[0] * 1000;
            position.y = coords[1] * 1000;
            position.z = coords[2] * 1000;
        }
        else
            position = coords

        if (delay){
            // delay and transition
            tween = new TWEEN.Tween(target)
                .to(position, delay)
                .easing(easing)
                .onComplete(complete)
                .start();
        }
        else {
            // update immediatly
            for (k in position)
                target[k] = position[k];
        }
    },

    increase_vertex_size :  function(){
                this.user_vtx_size = Math.min(25 , this.user_vtx_size * 1.5 );
                this.request_animation(100);
    },

    decrease_vertex_size :  function(){
                this.user_vtx_size = Math.max(0.1 , this.user_vtx_size / 1.5 );
                this.request_animation(100);
    },
        
    increase_font_size : function(){
        this.user_font_size = Math.min(25, this.user_font_size + 1 );
        this.request_animation(100);
    },
    
    decrease_font_size : function(){
        this.user_font_size = Math.max(-5, this.user_font_size - 1 );
        this.request_animation(100);
    },

    collapse : function(delay, easing, complete){
        /**
         * tween back vertices and edges to 0
         **/

        // restore vertices & edges positions to 0
        if (this.scene.children.length > 0){

            delay =  delay | 0;
            complete = complete | 0;

            var easing = easing || TWEEN.Easing.Circular.In;

            var coords = {x:0, y:0, z:0};

            for ( var i=0;  i<this.wnodes.length; i++ ) {
                var wnode = this.wnodes[i];
                this.setPosition(wnode.position, coords, delay, easing, complete );
            }

            for (var i=0;  i<this.wedges.length; i++ ) {
                var line = this.wedges[i];
                this.setPosition(line.geometry.vertices[0], coords, delay, easing, complete);
                this.setPosition(line.geometry.vertices[1], coords, delay, easing, complete);
            }

            this.request_animation();

        }

    },


    /**
     * Change camera target position
     * :pos: vector3 
     *  */
    setFocus : function(pos){
        if(pos == null)
            pos =new THREE.Vector3(0, 0, 0);
        tween = new TWEEN.Tween(this.controls.target)
            .to(pos, this.changeFocusSpeed)
            .start();
    },

    /** Force continuous rendering for *duration* time :
     *   - stop current animate timeout
     *   - set this.ANIMATE to True
     *   - set a time out to switch this.ANIMATE to False in duration time
     *
     * if called without *duration* it just cancel the animate timeout and re-run it
     */
    request_animation: function(duration){
        // special handle with ff rendering pb during mouse wheel

        if (duration) {
            // set flag to force continous animation
            this.ANIMATE = true;
            // cancel current continous animation stop timeout, if any
            if(this._animate_timeout_id){
                clearTimeout(this._animate_timeout_id);
                this._animate_timeout_id = null;
            }
            // set a new continous animation stop timeout
            var _this = this;
            this._animate_timeout_id = setTimeout(function(){
                _this.ANIMATE = false;
            }, duration);
        }

        // cancel animate timeout if any exists
        if (this._timeout_id){
            clearTimeout(this._timeout_id);
            this._timeout_id = null;
            // and restart a clear animation loop
            requestAnimationFrame(this.animate);
        }
    },

    /** main animaton loop */
    animate: function() {
        // render frame
        this.render();
        
        
        // determine if tween animation are curently running
        var has_tweens = TWEEN.getAll().length > 0;

        // loop calls
        // if(this.controls.AUTO_ROTATE && this.ENABLE_FOG)
        // {
        //     Backbone.trigger("cameramove");
        // }

        // render immediatly if ( mouse down, transition or animation in progress)
        if( (this.ANIMATE || has_tweens || this.MOUSEDOWN || this.controls.AUTO_ROTATE) && this.WINDOWVISIBLE )
        {
            requestAnimationFrame(this.animate);
        }
        else { // render one frame every 5 sec
            var _this = this;
            this._timeout_id = setTimeout(function(){
                requestAnimationFrame(_this.animate);
            }, 5000);
        }

        return this;
    },

    render: function() {
        // camera controls
        this.controls.update();

        // objects transitions
        TWEEN.update();

        // clear canvas
        var canvas = this.renderer.domElement;
        var ctx = canvas.getContext('2d')
        ctx.globalAlpha = 1;
        ctx.fillStyle = this.background_style;
        ctx.fillRect(0,0, canvas.width, canvas.height);

        // render frame

        this.renderer.DISPLAY_EDGE = this.show_edges;
        this.renderer.DISPLAY_EDGE_LABEL = this.show_edges && this.DISPLAY_EDGE_LABEL;
        this.renderer.DISPLAY_ARROW_INIT = this.show_edges && this.DISPLAY_ARROW_INIT;
        this.renderer.DISPLAY_ARROW_END = this.show_edges && this.DISPLAY_ARROW_END;
        this.renderer.ENABLE_FOG = this.ENABLE_FOG;

        this.renderer.render( this.scene, this.camera );
        this.renderClustersLabels(ctx);

        if (this.debug)
        {
            this.print_debug();
        }

        return this;
    },

    renderClustersLabels: function (context){
        
        if (! this.clustering){ return ;}
        
        var gviz = this;

        for (var i in this.clustering.clusters.models) {

            var cluster = this.clustering.clusters.models[i];
            
            var members = cluster.members.vs.models;
            var n = 0,
                point = {x:0, y:0, minX:100000, maxX:0, minY:100000, maxY:0};

            members.forEach( function(e,j){
                var v = gviz.wnidx[e.id];
                if ( !v || v.screenX < 0 ) return;

                var x = v.screenX;
                var y = v.screenY;
                n ++;
                point.y += y
                point.x += x
                point.minX = Math.min( x, point.minX )
                point.maxX = Math.max( x, point.maxX )
                //point.minY = Math.min( y, point.minY )
                //point.maxY = Math.max( y, point.maxY )
                //v.screenX = -1; 
            } );
            
            var label = "Cluster " + i;
            if ( cluster.labels || cluster.labels.length) {
                var labels = cluster.labels.map( function(e){ return e.label } )
                label = labels.join( ", " );
            }
            if ( !label.length ) continue ;
            
            context.font =  Math.min(25, 14 + n ) +  "px Arial";
            context.lineWidth = 3;
            
            var width = context.measureText(label).width;
            var height = context.measureText("M").width;
            
            point.y = point.y / n;
            if ( n == 1 ){
                point.x = point.x - width/2;
            }
            else {
                point.x = point.minX  +  ( point.maxX - point.minX - width)/2 ;
            }
        
            context.beginPath();
            context.rect(point.x - 8, point.y - 5 - height , width + 16, height + 16 );
            context.fillStyle = "rgba(200,200,200, 0.5)";
            context.fill();

            var color = "rgb(" + cluster.color.join(',') + ")";
            context.fillStyle = color;
            context.strokeStyle = "#333";
            context.strokeText(label ,point.x, point.y);
            context.fillText(label ,point.x, point.y);
        }
        
    },

    print_debug: function (){
        var $debug =$(".gviz-debug", this.$el);
        var $div = $("<div></div>").append([
            "camera.x:"+ this.camera.position.x + "<br/>",
            "camera.y:"+ this.camera.position.y + "<br/>",
            "camera.z:"+ this.camera.position.z + "<br/>",
            "user_vtx_size:"+ this.user_vtx_size + "<br/>",
            "<br/>"
        ]);

        var obj = this.intersected;
        if (obj)
        {
            var wnode =  this.wnidx[obj.id];
            var node = obj;
            $div.append("<h3>"+ obj._type +"</h3>" );

            if (wnode)
            {
                $div
                    .append("obj.id:"+ node.get("id") + "<br/>")
                    .append("obj.x:"+ wnode.position.x + "<br/>")
                    .append("obj.y:"+ wnode.position.y + "<br/>")
                    .append("obj.z:"+ wnode.position.z + "<br/>")
                    .append( "<br/>")
                    .append("neighbors:"+ node.get('neighbors') + "<br/>")
                    .append( "<br/>")
                    .append("flags:"+ node.get('flags') + "<br/>")

                    .append( "<br/>")
                    .append("distance:"+ node._distance + "<br/>")
                    .append("ratio:"+ node._ratio + "<br/>")
                    .append("scale:"+ this.wnode_scale(node) + "<br/>")
                    .append("wscale:"+ wnode.scale.x + "<br/>")
                    .append("material scale:"+ wnode.program_material.scale + "<br/>")
                    .append("font scale:"+ wnode.program_material.fontScale + "<br/>")
                    .append( "<br/>")
            }
            else {
                $div
                    .append("flags:"+ obj.get('flags') + "<br/>");
            }

        }
        $debug.html($div)

    },



    // ====  EVENTS  ====

    getMouseOnCanvas : function(event, rect){
        // FIXME broken with jquery 1.9+
        return { x: event.clientX - rect.left ,
                 y: event.clientY - rect.top};

        //return { x: event.pageX - rect.left ,
        //y: event.pageY - rect.top     };

        //if ($.browser.webkit){
        //return { x: event.clientX - rect.left ,
        //y: event.clientY - rect.top     }
        //}
        //else { // if ($.browser.mozilla){
        //return { x: event.clientX - rect.left - $('body').scrollLeft(),
        //y: event.clientY - rect.top - $('body').scrollTop()     }
        //}
    },

    /** When the mouse move over the Canvas
     *
     * if mouse is NOT pressed then it check if a node is intersected
     * and update the model in consequence
     */
    onMouseMove: function( event ) {
        event.preventDefault();
        this.MOUSEHASMOVED = true;

        // FIXME event callback
        var popup_event = function(){}; // empty function for compatibility

        if (this.MOUSEDOWN === false){
            var rect = this.el.getBoundingClientRect();
            // relative mouse position
            var mouse_canvas = this.getMouseOnCanvas(event, rect);
            var mouse = {
                x : (mouse_canvas.x / $('canvas', this.$el).width()) * 2 - 1,
                y : - ( mouse_canvas.y / $('canvas', this.$el).height() ) * 2 + 1
                };

            // find intersections
            var raycaster = new THREE.Raycaster();
            raycaster.linePrecision = this.raycaster_precision;
            raycaster.setFromCamera(mouse, this.camera);
            
            var intersect = null;
            var intersects = raycaster.intersectObjects(this.scene.children);

            if ( intersects.length > 0 ) {
                for (var i in intersects){
                    var inter = intersects[i].object
                    if ( !inter.material || inter.material.opacity == 0. || !inter.visible )
                        continue;
                        
                    var intertype = inter._type

                    if( "vertex" == intertype )
                    {
                        intersect = inter._node;
                        this.trigger( "vertex:mouseover", intersect, event);
                        break;
                    }
                    else if ("edge" == intertype )
                    {
                        intersect = inter._edge;
                        this.trigger( "edge:mouseover", intersect, event);
                        break;
                    }
                }
                
                if ( intersect == null ) {
                    this.trigger("intersectOff", this.intersected, event);
                }
                
            }
            else {
                this.trigger("intersectOff", this.intersected, event);
            }
            
            this.intersected = intersect;
        }
        
    },

    /** Just update the flags
     */
    onMouseDown: function( event ) {
        event.preventDefault();
        this.MOUSEDOWN = true;
        this.MOUSEHASMOVED = false;
        this.request_animation();
    },

    /** When mouse released, update the selected node
        TODO update onMouseup:  Cello.Edge ==> this.es.model
    */
    onMouseUp: function( event ) {
        event.preventDefault();

        var intertype = null;

        if (this.MOUSEHASMOVED === false) {
            if (this.intersected instanceof Cello.Edge)
                intertype = "edge";
            else if (this.intersected instanceof Cello.Vertex)
                intertype = "vertex";

            if (intertype)
                this.trigger( intertype + ":click", this.intersected, event);
            
            this.trigger("click",  this.intersected, event);

        }
        this.MOUSEDOWN = false;
    },

    /** When mouse goes out of canvas, update the flags
     */
    onMouseOut: function( event ) {
        event.preventDefault();
        this.MOUSEDOWN = false;
    },

    /** When dbl click on the canvas, raise "dblclick" event with intersected node (if any)
     */
    onDblClick: function( event ){
        Backbone.trigger("dblclick" , this.intersected, event);
        var intertype = null;
        if (this.intersected instanceof Cello.Edge)
            intertype = "edge";
        else if (this.intersected instanceof Cello.Vertex)
            intertype = "vertex";

        if (intertype)
            this.trigger( intertype + ":dblclick", this.intersected, event);
        else
            this.controls.AUTO_ROTATE = !this.controls.AUTO_ROTATE;
    },


    //install_listeners

}); // ThreeViz



/* TODO
 *
 */

gviz.ThreeVizHelpers = {
    PI2: Math.PI * 2,

    SPLIT_LABEL_RE: /^(.{4,15}) (.*)/m,

    to_color: function(color){
        if (_.isArray(color))
            return new THREE.Color( color[0],color[1],color[2]);
    },

    meanColor : function(/* <THREE.Color> arguments */){
        /** computes the meancolor of given *THREE.Color  */
        var r = g = b =0;
        for (var i in arguments){
            var color = arguments[i]
            r += color.r;
            g += color.g;
            b += color.b;
        }
        mean = new THREE.Color();
        mean.r = r / arguments.length;
        mean.g = g / arguments.length;
        mean.b = b / arguments.length;
        return mean;
    },

    wnode_scale : function(vtx){
        
        var v = vtx.get('SIZE'); // [0,1]
        return  ( this.user_vtx_size  ) * v ; 
    },
        
    // optimizations
    //      http://blogs.msdn.com/b/eternalcoding/archive/2012/03/23/lib-233-rez-la-puissance-du-canvas-de-html5-pour-vos-jeux-partie-1.aspx
    render_node : function( viz, wnode, context ) {
        /* Sample default rendering method
         * Draws vertex and text
         **/

        var _this = viz;
        var node = wnode._node; 

        // update material
        if (wnode.material_needs_update)
        {
            viz.set_node_material(node);
        }

        var material = wnode.program_material;

        // material hidden
        if ( !material.opacity || ! material.visible ) return ;

        
        context.globalAlpha = material.opacity

        
        
        // fog : modifies  
        if(viz.ENABLE_FOG && node.flags[1]==null) {
            // fog will happens only in default mode
            var pos = wnode.position.clone();
            pos.add(viz.camera.position);
            viz.camera.worldToLocal(pos);
            
            // material opacity
            var _opacityFactor = 1;
            _opacityFactor *= ( pos.z >= -1 )? 1 :  Math.exp( pos.z /  _this.fogDistance);
            context.globalAlpha = material.opacity * _opacityFactor;
        }
        

        var wscale = viz.wnode_scale(node)

        if (viz.adaptive_zoom)
        {
            var distance = viz.camera.position.distanceTo(wnode.position)
            var ratio = distance == 0 ? 1 : (distance/1000) ;
            var minscale = wscale / 10;
            var maxscale = wscale * 1;

            wscale =   ( minscale + (maxscale - minscale ) * ratio );
            node._scale = wscale;
        }
        
        if (wnode.scale.x != wscale )
        {
            wnode.scale.x = wscale;
            wnode.scale.y = wscale;
        }

        context.scale(1, -1);

        context.save()

        // Drawing Node
        if (viz.show_nodes){

            // shape 
            var re_rect = /^(rect:)([0-9/.]+),([0-9/.]+)/; // rect:2,1
            var match = null;
            var scale = material.scale;
            var width = scale, height = scale;
            context.scale(scale, scale);
            node._scale *= scale;

            // 
            
            if (material.shape == 'circle') // centered on 0.0
            {
                context.beginPath();
                context.arc(0, 0, 1, 0, gviz.ThreeVizHelpers.PI2, true);
                context.closePath();
            }
            else if (material.shape == 'square') // centered
            {
                context.beginPath();
                context.moveTo(-1,-1);
                context.lineTo(-1, 1);
                context.lineTo(1,1);
                context.lineTo(1,-1);
                context.lineTo(-1,-1);
                context.closePath();
            }
            else if (material.shape == 'losange' || material.shape == 'diamond') 
            {
                context.beginPath();
                context.moveTo(0, -1);
                context.lineTo(-1, 0);
                context.lineTo(0 , 1);
                context.lineTo(1,0);                
                context.closePath();
            }
            else if (material.shape == 'triangle' || material.shape == 'triangle-top') // centered
            {
                context.beginPath();
                context.moveTo(0, -1);
                context.lineTo(-1, 1);
                context.lineTo(1,1);
                context.closePath();
            }
            else if (material.shape == 'triangle-bottom') // centered
            {
                context.beginPath();
                context.moveTo(0, 1);
                context.lineTo(-1, -1);
                context.lineTo(1,-1);
                context.closePath();
            }
            else if ( (match = re_rect.exec(material.shape)) != null )
            {
                var w = width = match[2], h = height = match[3];
                context.beginPath();
                context.moveTo(-w,-h); // start
                context.lineTo(-w, h);
                context.lineTo(w,h);
                context.lineTo(w,-h);
                context.lineTo(-w,-h);
                context.closePath();
            }

            // fill
            if (material.fillStyle)
            {
                set_context_style(context, 'fillStyle', material.fillStyle);
                context.fill();
            }


            /* material image */
            if (viz.show_images){

                if (material.image) {
                    var img=document.getElementById("img" + material.id);
                    if (img && img.width){
                        context.clip();
                        context.drawImage(img,-width,-height, 2*width, 2*height);
                    }
                }

            }

            // sprite stroke
            if ( material.lineWidth > 0 && material.strokeStyle ) {

                context.lineWidth = material.lineWidth;
                set_context_style(context, 'strokeStyle', material.strokeStyle);
                context.stroke();
            }

        } // nodes

        // draw node ends here get the context back to it scale state
        context.restore();

        /*  Text */
        // if ((viz.show_text && (!viz.MOUSEHASMOVED|| !viz.MOUSEDOWN ))  ){
        if ( viz.show_text && material.textVisible ){
            context.save();

            var text_lines = material.text_lines;
            // draw text
            for (var i in text_lines){

                context.save();

                var x = 0,
                    y = 0,
                    
                    text_width = 0, //compute the text width 
                    userPaddingX = material.textPaddingX | 0,
                    userPaddingY = material.textPaddingY | 0,
                    paddingX = 0, paddingY = 0;
                    
                    
                var fontsize = 1;
                _.each(text_lines[i], function (token){
                    var font = _this.node_materials[token.css].font;
                    font = get_font(font, viz.user_font_size)
                    context.font = font;
                    fontsize = _.max([fontsize, parseInt(/([0-9]*)px/.exec(font)[1])]);
                    text_width += context.measureText(token.form).width;
                });
                
                /* vertical text alignement */
                 if (material.textVerticalAlign == 'center'){
                    y = 1; 
                }
                else if (material.textVerticalAlign == 'bottom'){
                    y = 0; 
                }
                else //if (material.textVerticalAlign == 'top')
                {
                    y = 0.5;
                }
                
                /* horizontal text alignement */
                if (material.textAlign == 'left'){
                    context.translate(1*material.scale,0);
                    x = 0 + paddingX;
                }
                else if (material.textAlign == 'right'){
                    context.translate(-1*material.scale,0)
                    x = -text_width + paddingX;
                }
                else {  // center: default
                    context.translate(0,1)
                    x = text_width / -2 + paddingX;
                }

                // text scale
                context.scale(material.fontScale, material.fontScale);

                var text_height = context.measureText('M').width;

                y = y - ( (text_lines.length - 1) * text_height / 2. ) + ( i * text_height )
                
                _.each(text_lines[i], function (token, j){
                    // font, position & draw
                    var css = _this.node_materials[token.css];
                    var paddingRelX = css.paddingRelX | 0;
                    var paddingRelY = css.paddingRelY | 0;

                    // position & draw
                    var font = get_font(css.font, viz.user_font_size)
                    var fontsize = parseInt(/([0-9]*)px/.exec(font)[1])
                    context.font = font ;

                    var xi = x + userPaddingX + paddingRelX;
                    var yi = y - userPaddingY;
                    
                    /* : TODO : text background */  
                    //maxX = Math.max(maxX, dimension.width + letter_width/2);
                    //context.fillStyle = "#F00";
                    //context.fillRect(-1,-letter_width + i*letter_width , maxX,letter_width*2);
                    //sumY += letter_width*2;

                    // text style
                    if (css.fontFillStyle){
                        set_context_style(context, "fillStyle", css.fontFillStyle);
                        context.fillText(token.form , xi, yi);
                    }
                    if (css.fontStrokeStyle && css.fontStrokeWidth ){
                        set_context_style(context, "strokeStyle", css.fontStrokeStyle);
                        context.lineWidth = css.fontStrokeWidth;
                        context.strokeText(token.form , xi, yi);
                    }

                    //updating of x to print the rest of the text
                    var text_width = context.measureText(token.form).width;
                    x  += text_width;
                });
                
                context.restore();
            }
            context.restore();
        } // text
    },

edge_materials : [
    { 'default': {
        'lineWidth': 2,
        'linecap'  : "butt", // "butt", "round", "square"
        'linejoin' : "bevel",// "round", "bevel", "miter"

        'lineType' : "plain",  // plain , dashed
        'dashSize' : 2,
        'gapSize'  : 5,
        
        'opacity'  : 0.61,
        'color'    : function(edge){ return [gviz.hexcolor(edge.source.get('color')),
                                              gviz.hexcolor(edge.target.get('color'))]
                                    },

        'label_visible' : false,
        'font' : 'normal 12px Arial',
        'fontFillStyle': "#4C4D00",
        'textAlign': "center",
        
        'orientation_visible':false,       
                                    
    }},
],

node_materials : [
    { 'default': {
        'visible' : true, 
        // particule properties
        'scale'      : 1,
        'z' : 1,
        'opacity'    : 1,
        // 'opacity'    : function(node){
        //     var z = node._z;
        //     if(_app.gviz.gviz.ENABLE_FOG)
        //     return ( z >= -1 )? 1 :  Math.exp( z / this.fogDistance );
        //     else return 1;
        // },

        'line_max_length' : 15,

        'shape'      : 'circle', // 'circle', 'square', 'triangle' == 'triangle-top', 'triangle-down', 'losange'
        'image':"prop:image",
        //'image'      : "logo",

        'fillStyle': function(node){return "gradient:" + gviz.csscolor(node.get('color'))},
        /* alternative:
         * 'fillStyle': function(node){return ['#FF0000', '#0000FF']},
         * 'fillStyle'  : function(node){return [hexcolor(node.get('color')),
         *                                   hexcolor(node.get('color'))]},
         */
        'strokeStyle': function(node){return "gradient:"+ gviz.csscolor(node.get('color'))},
        //'strokeStyle': "get:color" ,
        //'strokeStyle': "gradient:#AAAAAA" ,
        'lineWidth'  : 0.1,

        // text length
        'textLength' : 20,

        // font properties
        'textVisible' : true,
        'textAlign'  : 'center',
        'textVerticalAlign'  : 'center', 
        'fontScale'  :  0.1,
        'font' : 'normal 10px Arial',
        'fontFillStyle' : '#333',
        'fontStrokeStyle' : '#333',
        'fontStrokeWidth'  : .1,
        'paddingRelY' : 0,
        'paddingRelX' : 2
    }
    },

    {'.normal-font' : {
        'font' : 'normal 10px Arial',
        'fontFillStyle' : '#333',
        'fontStrokeStyle' : '#333',
        'fontStrokeWidth' : .1,
        'paddingRelY' : 0,
        'paddingRelX' : 2
    }
    },

]

}; //gviz.ThreeVizHelpers



var Gviz = gviz

// == gviz/factory.js ==


Gviz.SimpleViz = function(graph, attrs){
    
    attrs.model = graph;

    var gviz = new Gviz.ThreeViz(attrs);

    // --- Events ---

    gviz.on('click', function(obj, event){
        if(obj == null){
            Backbone.trigger(Const.unselect_nodes);
            Backbone.trigger(Const.unselect_edges );
            if ( gviz.AUTO_FOCUS)
                gviz.setFocus();
        }
    });

    gviz.on( 'vertex:click', function(vertex, event){
      if (vertex && vertex.id && vertex.has_flag && (vertex.has_flag('disabled') == false)) {  
        //$(' #vz_threejs_main').popup('show');
            
        var selected = graph.vs.by_flag("selected");
        if (selected.length == 1 && event.ctrlKey)
            Backbone.trigger(Const.ui_create_edge, { source: selected[0], target:vertex} );
        
        Backbone.trigger(Const.select_node, vertex );
      }

    });
    
    gviz.on( 'vertex:mouseover', function( vertex, event){
      if (vertex && vertex.id && vertex.has_flag && (vertex.has_flag('disabled') == false)) 
        Backbone.trigger("vertex:mouseover", vertex, event );
    });

    gviz.on( 'vertex:dblclick', function(vertex, event){
      if (vertex && vertex.id && vertex.has_flag && (vertex.has_flag('disabled') == false)) 
        Backbone.trigger('engine:expand_prox',
                { expand : [vertex.id] , weights : [1] }
            );
    });
    
    gviz.on( 'edge:mouseover', function( edge, event){
        
      if (edge && edge.id && edge.has_flag && (edge.has_flag('disabled') == false)) 
        Backbone.trigger("edge:mouseover", edge, event );
    });

    gviz.on( 'edge:click', function(edge, event){
      console.log( 'edge:click' , edge, event);
      if (edge && edge.id && edge.has_flag && (edge.has_flag('disabled') == false)) 
        Backbone.trigger(Const.select_edge, edge, event );
    });

    gviz.on( 'dblclick', function(node, event){
        //- TODO should fire event
        console.log("dblclick", node, event);
    });

    gviz.on('intersectOff', function(obj, event){
        
      if (obj && obj.id && obj.has_flag && (obj.has_flag('disabled') == false)) {
        graph.es.remove_flag('intersected');
        graph.vs.remove_flag('intersected');
        if (obj.edgetype) Backbone.trigger("edge:mouseout", obj, event );
        if (obj.nodetype) Backbone.trigger("vertex:mouseout", obj, event );
        gviz.request_animation();
      }
      //else
         //Backbone.trigger("mousemoved", event )
        
      // $('#vz_mouse_position').popup('hide');
        
    });
    
    Backbone.listenTo( Backbone, 'vertex:mouseout', function( vertex, event){
        //graph.es.set_intersected([]);
        //graph.vs.set_intersected([]);
        if (vertex && vertex.id){  
            vertex.remove_flag('intersected')
        }
    });

    Backbone.listenTo( Backbone, 'vertex:mouseover', function( vertex, event){
        
      if (vertex && vertex.id){  

        graph.vs.set_intersected(vertex !== null ? vertex : []);
        graph.es.set_intersected(vertex.incident(4, false));

        if (vertex.has_flag("selected")){
            this.vertex_menu = vertex;
            //$('#vz_mouse_position').popup('show');
        }

        gviz.request_animation();
      }
    });
    
    Backbone.listenTo( Backbone, 'engine:request_animation', function(){
            gviz.request_animation();
    });

    Backbone.listenTo( Backbone, 'edge:mouseover', function( edge, event){
        
      if (edge && edge.id){  
        graph.vs.set_intersected([]);
        graph.es.set_intersected(edge !== null ? edge : []);
        //gviz.request_animation();
      }
    });
    
    Backbone.listenTo( Backbone, 'edge:mouseout', function( edge, event){
      if (edge && edge.id){
        edge.remove_flag('intersected');
        //gviz.request_animation();
      }
    });    

    gviz.listenTo(graph.vs, 'reset',  function(){

        console.log("padagraph-gviz", "vs reset");

        gviz.collapse(500);
        gviz.clean();

        gviz.camera.position.x = 0;
        gviz.camera.position.y = 0,
        gviz.camera.position.z = gviz.initial_z;

        gviz.camera.lookAt( new THREE.Vector3(0,0,0));
    });


    gviz.listenTo(graph.es, 'add',  function(edge)  {

        gviz.append_edge(edge);

        gviz.listenTo(edge, "addflag:selected", function() {
            edge.add_flag('es-bolder', {silent:true});
            edge.add_flag('es-mo-adjacent');
        });
        gviz.listenTo(edge, "rmflag:selected", function() {
            edge.remove_flag('es-bolder', {silent:true});
            edge.remove_flag('es-mo-adjacent');
        });

        gviz.listenTo(edge, "addflag:intersected", function() {
            edge.add_flag('es-bolder');
        });
        gviz.listenTo(edge, "rmflag:intersected", function() {
            edge.remove_flag('es-bolder');
        });

    });
    
    gviz.listenTo(graph.es, 'remove',  function(edge, options)  {
        edge.remove_flag('intersected', {silent:true});
        edge.remove_flag('selected', {silent:true});
        edge.remove_flag('disabled');
        gviz.remove_edge(edge);
        
    }.bind(this));

    gviz.listenTo(graph.vs, 'remove',  function(node)  {
        node.remove_flag('intersected', {silent:true});
        node.remove_flag('selected', {silent:true});
        node.remove_flag('disabled');
        gviz.remove_node(node);
    }.bind(this));

    gviz.listenTo(graph.vs, 'add',  function(node){

        _size = function(vtx){
            if (vtx.get('properties').has("size")) {
                return parseFloat(vtx.get('properties').get('size'));              
            }
            else return 1;
        }
        
        var max_size = _.map(graph.vs.models, _size).sort();
        max_size = max_size[(max_size.length/2) | 1]
        
        _.each(graph.vs.models, function(vtx){
            vtx.set('SIZE' , 9 * (_size(vtx) / max_size) )
        } )
        
        gviz.append_node(node);
    
        gviz.listenTo(node, "addflag:intersected", function() {
            
            var nodes = node.neighbors();
            nodes.push(node);
            graph.vs.add_flag('mo-faded', _(graph.vs.models).difference(nodes));
            graph.vs.add_flag('mo-adjacent', _(nodes).without(node));
            
            var edges = graph.incident(node);
            //graph.es.add_flag('es-bolder', edges);
            graph.es.add_flag('es-mo-adjacent',  edges, false );
            graph.es.add_flag('es-mo-faded', _.difference(graph.es.models, edges), false);

            gviz.request_animation();
        });

        gviz.listenTo(node, "rmflag:intersected", function() {
            graph.vs.remove_flag('mo-faded', graph.vs.models);
            graph.vs.remove_flag('mo-adjacent');
            
            graph.es.remove_flag('es-mo-adjacent', graph.es.models );
            graph.es.remove_flag('es-mo-faded' );
            graph.es.remove_flag('es-bolder' );
            
            gviz.request_animation();
        });
        
        gviz.listenTo(node, "addflag:selected", function(vtx) {

            vtx.collection.remove_flag('selected', _(graph.vs.models).without(vtx));

            var nodes = node.neighbors();
            vtx.collection.add_flag('sel-faded', _(graph.vs.models).difference(nodes));
            vtx.collection.add_flag('sel-adjacent', _(nodes).without(vtx));
            
            var edges = graph.incident(vtx);
            graph.es.add_flag('es-bolder', edges, {silent:true});
            graph.es.add_flag('es-sel-adjacent', edges, {silent:true});
            graph.es.add_flag('es-sel-faded', _(graph.es.models).difference(edges));
            
            gviz.request_animation();
        });
        
        graph.listenTo(node, "rmflag:selected",  function(vtx) {
            
            graph.vs.remove_flag('mo-faded');
            graph.vs.remove_flag('sel-faded');
            graph.vs.remove_flag('sel-adjacent');
            
            graph.es.remove_flag('es-bolder');  
            graph.es.remove_flag('es-sel-adjacent');
            graph.es.remove_flag('es-sel-faded');
            graph.es.remove_flag('es-mo-faded');
            
        } );
        
    }.bind(this));

    return gviz;
}
// == gviz/Projector.js ==

/**
 * @author mrdoob / http://mrdoob.com/
 * @author supereggbert / http://www.paulbrunt.co.uk/
 * @author julianwa / https://github.com/julianwa
 */

THREE.RenderableObject = function () {

	this.id = 0;

	this.object = null;
	this.z = 0;
	this.renderOrder = 0;

};

//

THREE.RenderableFace = function () {

	this.id = 0;

	this.v1 = new THREE.RenderableVertex();
	this.v2 = new THREE.RenderableVertex();
	this.v3 = new THREE.RenderableVertex();

	this.normalModel = new THREE.Vector3();

	this.vertexNormalsModel = [ new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3() ];
	this.vertexNormalsLength = 0;

	this.color = new THREE.Color();
	this.material = null;
	this.uvs = [ new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2() ];

	this.z = 0;
	this.renderOrder = 0;

};

//

THREE.RenderableVertex = function () {

	this.position = new THREE.Vector3();
	this.positionWorld = new THREE.Vector3();
	this.positionScreen = new THREE.Vector4();

	this.visible = true;

};

THREE.RenderableVertex.prototype.copy = function ( vertex ) {

	this.positionWorld.copy( vertex.positionWorld );
	this.positionScreen.copy( vertex.positionScreen );

};

//

THREE.RenderableLine = function () {

	this.id = 0;

	this.v1 = new THREE.RenderableVertex();
	this.v2 = new THREE.RenderableVertex();

	this.vertexColors = [ new THREE.Color(), new THREE.Color() ];
	this.material = null;

	this.z = 0;
	this.renderOrder = 0;

};

//

THREE.RenderableSprite = function () {

	this.id = 0;

	this.object = null;

	this.x = 0;
	this.y = 0;
	this.z = 0;

	this.rotation = 0;
	this.scale = new THREE.Vector2();

	this.material = null;
	this.renderOrder = 0;

};

//

THREE.Projector = function () {

	var _object, _objectCount, _objectPool = [], _objectPoolLength = 0,
	_vertex, _vertexCount, _vertexPool = [], _vertexPoolLength = 0,
	_face, _faceCount, _facePool = [], _facePoolLength = 0,
	_line, _lineCount, _linePool = [], _linePoolLength = 0,
	_sprite, _spriteCount, _spritePool = [], _spritePoolLength = 0,

	_renderData = { objects: [], lights: [], elements: [] },

	_vector3 = new THREE.Vector3(),
	_vector4 = new THREE.Vector4(),

	_clipBox = new THREE.Box3( new THREE.Vector3( - 1, - 1, - 1 ), new THREE.Vector3( 1, 1, 1 ) ),
	_boundingBox = new THREE.Box3(),
	_points3 = new Array( 3 ),
	_points4 = new Array( 4 ),

	_viewMatrix = new THREE.Matrix4(),
	_viewProjectionMatrix = new THREE.Matrix4(),

	_modelMatrix,
	_modelViewProjectionMatrix = new THREE.Matrix4(),

	_normalMatrix = new THREE.Matrix3(),

	_frustum = new THREE.Frustum(),

	_clippedVertex1PositionScreen = new THREE.Vector4(),
	_clippedVertex2PositionScreen = new THREE.Vector4();

	//

	this.projectVector = function ( vector, camera ) {

		console.warn( 'THREE.Projector: .projectVector() is now vector.project().' );
		vector.project( camera );

	};

	this.unprojectVector = function ( vector, camera ) {

		console.warn( 'THREE.Projector: .unprojectVector() is now vector.unproject().' );
		vector.unproject( camera );

	};

	this.pickingRay = function ( vector, camera ) {

		console.error( 'THREE.Projector: .pickingRay() is now raycaster.setFromCamera().' );

	};

	//

	var RenderList = function () {

		var normals = [];
		var uvs = [];

		var object = null;
		var material = null;

		var normalMatrix = new THREE.Matrix3();

		var setObject = function ( value ) {

			object = value;
			material = object.material;

			normalMatrix.getNormalMatrix( object.matrixWorld );

			normals.length = 0;
			uvs.length = 0;

		};

		var projectVertex = function ( vertex ) {

			var position = vertex.position;
			var positionWorld = vertex.positionWorld;
			var positionScreen = vertex.positionScreen;

			positionWorld.copy( position ).applyMatrix4( _modelMatrix );
			positionScreen.copy( positionWorld ).applyMatrix4( _viewProjectionMatrix );

			var invW = 1 / positionScreen.w;

			positionScreen.x *= invW;
			positionScreen.y *= invW;
			positionScreen.z *= invW;

			vertex.visible = positionScreen.x >= - 1 && positionScreen.x <= 1 &&
					 positionScreen.y >= - 1 && positionScreen.y <= 1 &&
					 positionScreen.z >= - 1 && positionScreen.z <= 1;

		};

		var pushVertex = function ( x, y, z ) {

			_vertex = getNextVertexInPool();
			_vertex.position.set( x, y, z );

			projectVertex( _vertex );

		};

		var pushNormal = function ( x, y, z ) {

			normals.push( x, y, z );

		};

		var pushUv = function ( x, y ) {

			uvs.push( x, y );

		};

		var checkTriangleVisibility = function ( v1, v2, v3 ) {

			if ( v1.visible === true || v2.visible === true || v3.visible === true ) return true;

			_points3[ 0 ] = v1.positionScreen;
			_points3[ 1 ] = v2.positionScreen;
			_points3[ 2 ] = v3.positionScreen;

			return _clipBox.isIntersectionBox( _boundingBox.setFromPoints( _points3 ) );

		};

		var checkBackfaceCulling = function ( v1, v2, v3 ) {

			return ( ( v3.positionScreen.x - v1.positionScreen.x ) *
				    ( v2.positionScreen.y - v1.positionScreen.y ) -
				    ( v3.positionScreen.y - v1.positionScreen.y ) *
				    ( v2.positionScreen.x - v1.positionScreen.x ) ) < 0;

		};

		var pushLine = function ( a, b ) {

			var v1 = _vertexPool[ a ];
			var v2 = _vertexPool[ b ];

			_line = getNextLineInPool();

			_line.id = object.id;
			_line.v1.copy( v1 );
			_line.v2.copy( v2 );
			_line.z = ( v1.positionScreen.z + v2.positionScreen.z ) / 2;
			_line.renderOrder = object.renderOrder;

			_line.material = object.material;

			_renderData.elements.push( _line );

		};

		var pushTriangle = function ( a, b, c ) {

			var v1 = _vertexPool[ a ];
			var v2 = _vertexPool[ b ];
			var v3 = _vertexPool[ c ];

			if ( checkTriangleVisibility( v1, v2, v3 ) === false ) return;

			if ( material.side === THREE.DoubleSide || checkBackfaceCulling( v1, v2, v3 ) === true ) {

				_face = getNextFaceInPool();

				_face.id = object.id;
				_face.v1.copy( v1 );
				_face.v2.copy( v2 );
				_face.v3.copy( v3 );
				_face.z = ( v1.positionScreen.z + v2.positionScreen.z + v3.positionScreen.z ) / 3;
				_face.renderOrder = object.renderOrder;

				// use first vertex normal as face normal

				_face.normalModel.fromArray( normals, a * 3 );
				_face.normalModel.applyMatrix3( normalMatrix ).normalize();

				for ( var i = 0; i < 3; i ++ ) {

					var normal = _face.vertexNormalsModel[ i ];
					normal.fromArray( normals, arguments[ i ] * 3 );
					normal.applyMatrix3( normalMatrix ).normalize();

					var uv = _face.uvs[ i ];
					uv.fromArray( uvs, arguments[ i ] * 2 );

				}

				_face.vertexNormalsLength = 3;

				_face.material = object.material;

				_renderData.elements.push( _face );

			}

		};

		return {
			setObject: setObject,
			projectVertex: projectVertex,
			checkTriangleVisibility: checkTriangleVisibility,
			checkBackfaceCulling: checkBackfaceCulling,
			pushVertex: pushVertex,
			pushNormal: pushNormal,
			pushUv: pushUv,
			pushLine: pushLine,
			pushTriangle: pushTriangle
		}

	};

	var renderList = new RenderList();

	this.projectScene = function ( scene, camera, sortObjects, sortElements ) {

		_faceCount = 0;
		_lineCount = 0;
		_spriteCount = 0;

		_renderData.elements.length = 0;

		if ( scene.autoUpdate === true ) scene.updateMatrixWorld();
		if ( camera.parent === null ) camera.updateMatrixWorld();

		_viewMatrix.copy( camera.matrixWorldInverse.getInverse( camera.matrixWorld ) );
		_viewProjectionMatrix.multiplyMatrices( camera.projectionMatrix, _viewMatrix );

		_frustum.setFromMatrix( _viewProjectionMatrix );

		//

		_objectCount = 0;

		_renderData.objects.length = 0;
		_renderData.lights.length = 0;

		scene.traverseVisible( function ( object ) {

			if ( object instanceof THREE.Light ) {

				_renderData.lights.push( object );

			} else if ( object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Sprite ) {

				var material = object.material;

				if ( material.visible === false ) return;

				if ( object.frustumCulled === false || _frustum.intersectsObject( object ) === true ) {

					_object = getNextObjectInPool();
					_object.id = object.id;
					_object.object = object;

					_vector3.setFromMatrixPosition( object.matrixWorld );
					_vector3.applyProjection( _viewProjectionMatrix );
					_object.z = _vector3.z;
					_object.renderOrder = object.renderOrder;

					_renderData.objects.push( _object );

				}

			}

		} );

		if ( sortObjects === true ) {

			_renderData.objects.sort( painterSort );

		}

		//

		for ( var o = 0, ol = _renderData.objects.length; o < ol; o ++ ) {

			var object = _renderData.objects[ o ].object;
			var geometry = object.geometry;

			renderList.setObject( object );

			_modelMatrix = object.matrixWorld;

			_vertexCount = 0;

			if ( object instanceof THREE.Mesh ) {

				if ( geometry instanceof THREE.BufferGeometry ) {

					var attributes = geometry.attributes;
					var groups = geometry.groups;

					if ( attributes.position === undefined ) continue;

					var positions = attributes.position.array;

					for ( var i = 0, l = positions.length; i < l; i += 3 ) {

						renderList.pushVertex( positions[ i ], positions[ i + 1 ], positions[ i + 2 ] );

					}

					if ( attributes.normal !== undefined ) {

						var normals = attributes.normal.array;

						for ( var i = 0, l = normals.length; i < l; i += 3 ) {

							renderList.pushNormal( normals[ i ], normals[ i + 1 ], normals[ i + 2 ] );

						}

					}

					if ( attributes.uv !== undefined ) {

						var uvs = attributes.uv.array;

						for ( var i = 0, l = uvs.length; i < l; i += 2 ) {

							renderList.pushUv( uvs[ i ], uvs[ i + 1 ] );

						}

					}

					if ( geometry.index !== null ) {

						var indices = geometry.index.array;

						if ( groups.length > 0 ) {

							for ( var o = 0; o < groups.length; o ++ ) {

								var group = groups[ o ];

								for ( var i = group.start, l = group.start + group.count; i < l; i += 3 ) {

									renderList.pushTriangle( indices[ i ], indices[ i + 1 ], indices[ i + 2 ] );

								}

							}

						} else {

							for ( var i = 0, l = indices.length; i < l; i += 3 ) {

								renderList.pushTriangle( indices[ i ], indices[ i + 1 ], indices[ i + 2 ] );

							}

						}

					} else {

						for ( var i = 0, l = positions.length / 3; i < l; i += 3 ) {

							renderList.pushTriangle( i, i + 1, i + 2 );

						}

					}

				} else if ( geometry instanceof THREE.Geometry ) {

					var vertices = geometry.vertices;
					var faces = geometry.faces;
					var faceVertexUvs = geometry.faceVertexUvs[ 0 ];

					_normalMatrix.getNormalMatrix( _modelMatrix );

					var material = object.material;

					var isFaceMaterial = material instanceof THREE.MeshFaceMaterial;
					var objectMaterials = isFaceMaterial === true ? object.material : null;

					for ( var v = 0, vl = vertices.length; v < vl; v ++ ) {

						var vertex = vertices[ v ];

						_vector3.copy( vertex );

						if ( material.morphTargets === true ) {

							var morphTargets = geometry.morphTargets;
							var morphInfluences = object.morphTargetInfluences;

							for ( var t = 0, tl = morphTargets.length; t < tl; t ++ ) {

								var influence = morphInfluences[ t ];

								if ( influence === 0 ) continue;

								var target = morphTargets[ t ];
								var targetVertex = target.vertices[ v ];

								_vector3.x += ( targetVertex.x - vertex.x ) * influence;
								_vector3.y += ( targetVertex.y - vertex.y ) * influence;
								_vector3.z += ( targetVertex.z - vertex.z ) * influence;

							}

						}

						renderList.pushVertex( _vector3.x, _vector3.y, _vector3.z );

					}

					for ( var f = 0, fl = faces.length; f < fl; f ++ ) {

						var face = faces[ f ];

						material = isFaceMaterial === true
							 ? objectMaterials.materials[ face.materialIndex ]
							 : object.material;

						if ( material === undefined ) continue;

						var side = material.side;

						var v1 = _vertexPool[ face.a ];
						var v2 = _vertexPool[ face.b ];
						var v3 = _vertexPool[ face.c ];

						if ( renderList.checkTriangleVisibility( v1, v2, v3 ) === false ) continue;

						var visible = renderList.checkBackfaceCulling( v1, v2, v3 );

						if ( side !== THREE.DoubleSide ) {

							if ( side === THREE.FrontSide && visible === false ) continue;
							if ( side === THREE.BackSide && visible === true ) continue;

						}

						_face = getNextFaceInPool();

						_face.id = object.id;
						_face.v1.copy( v1 );
						_face.v2.copy( v2 );
						_face.v3.copy( v3 );

						_face.normalModel.copy( face.normal );

						if ( visible === false && ( side === THREE.BackSide || side === THREE.DoubleSide ) ) {

							_face.normalModel.negate();

						}

						_face.normalModel.applyMatrix3( _normalMatrix ).normalize();

						var faceVertexNormals = face.vertexNormals;

						for ( var n = 0, nl = Math.min( faceVertexNormals.length, 3 ); n < nl; n ++ ) {

							var normalModel = _face.vertexNormalsModel[ n ];
							normalModel.copy( faceVertexNormals[ n ] );

							if ( visible === false && ( side === THREE.BackSide || side === THREE.DoubleSide ) ) {

								normalModel.negate();

							}

							normalModel.applyMatrix3( _normalMatrix ).normalize();

						}

						_face.vertexNormalsLength = faceVertexNormals.length;

						var vertexUvs = faceVertexUvs[ f ];

						if ( vertexUvs !== undefined ) {

							for ( var u = 0; u < 3; u ++ ) {

								_face.uvs[ u ].copy( vertexUvs[ u ] );

							}

						}

						_face.color = face.color;
						_face.material = material;

						_face.z = ( v1.positionScreen.z + v2.positionScreen.z + v3.positionScreen.z ) / 3;
						_face.renderOrder = object.renderOrder;

						_renderData.elements.push( _face );

					}

				}

			} else if ( object instanceof THREE.Line ) {

				if ( geometry instanceof THREE.BufferGeometry ) {

					var attributes = geometry.attributes;

					if ( attributes.position !== undefined ) {

						var positions = attributes.position.array;

						for ( var i = 0, l = positions.length; i < l; i += 3 ) {

							renderList.pushVertex( positions[ i ], positions[ i + 1 ], positions[ i + 2 ] );

						}

						if ( geometry.index !== null ) {

							var indices = geometry.index.array;

							for ( var i = 0, l = indices.length; i < l; i += 2 ) {

								renderList.pushLine( indices[ i ], indices[ i + 1 ] );

							}

						} else {

							var step = object instanceof THREE.LineSegments ? 2 : 1;

							for ( var i = 0, l = ( positions.length / 3 ) - 1; i < l; i += step ) {

								renderList.pushLine( i, i + 1 );

							}

						}

					}

				} else if ( geometry instanceof THREE.Geometry ) {

					_modelViewProjectionMatrix.multiplyMatrices( _viewProjectionMatrix, _modelMatrix );

					var vertices = object.geometry.vertices;

					if ( vertices.length === 0 ) continue;

					v1 = getNextVertexInPool();
					v1.positionScreen.copy( vertices[ 0 ] ).applyMatrix4( _modelViewProjectionMatrix );

					var step = object instanceof THREE.LineSegments ? 2 : 1;

					for ( var v = 1, vl = vertices.length; v < vl; v ++ ) {

						v1 = getNextVertexInPool();
						v1.positionScreen.copy( vertices[ v ] ).applyMatrix4( _modelViewProjectionMatrix );

						if ( ( v + 1 ) % step > 0 ) continue;

						v2 = _vertexPool[ _vertexCount - 2 ];

						_clippedVertex1PositionScreen.copy( v1.positionScreen );
						_clippedVertex2PositionScreen.copy( v2.positionScreen );

						if ( clipLine( _clippedVertex1PositionScreen, _clippedVertex2PositionScreen ) === true ) {

							// Perform the perspective divide
							_clippedVertex1PositionScreen.multiplyScalar( 1 / _clippedVertex1PositionScreen.w );
							_clippedVertex2PositionScreen.multiplyScalar( 1 / _clippedVertex2PositionScreen.w );

							_line = getNextLineInPool();

							_line.id = object.id;
							_line.v1.positionScreen.copy( _clippedVertex1PositionScreen );
							_line.v2.positionScreen.copy( _clippedVertex2PositionScreen );

							_line.z = Math.max( _clippedVertex1PositionScreen.z, _clippedVertex2PositionScreen.z );
							_line.renderOrder = object.renderOrder;

							_line.material = object.material;
							_line.object = object;

							if ( object.material.vertexColors === THREE.VertexColors ) {

								_line.vertexColors[ 0 ].copy( object.geometry.colors[ v ] );
								_line.vertexColors[ 1 ].copy( object.geometry.colors[ v - 1 ] );

							}

							_renderData.elements.push( _line );

						}

					}

				}

			} else if ( object instanceof THREE.Sprite ) {

				_vector4.set( _modelMatrix.elements[ 12 ], _modelMatrix.elements[ 13 ], _modelMatrix.elements[ 14 ], 1 );
				_vector4.applyMatrix4( _viewProjectionMatrix );

				var invW = 1 / _vector4.w;

				_vector4.z *= invW;

				if ( _vector4.z >= - 1 && _vector4.z <= 1 ) {

					_sprite = getNextSpriteInPool();
					_sprite.id = object.id;
					_sprite.x = _vector4.x * invW;
					_sprite.y = _vector4.y * invW;
					_sprite.z = _vector4.z;
					_sprite.renderOrder = object.renderOrder;
					_sprite.object = object;

					_sprite.rotation = object.rotation;

					_sprite.scale.x = object.scale.x * Math.abs( _sprite.x - ( _vector4.x + camera.projectionMatrix.elements[ 0 ] ) / ( _vector4.w + camera.projectionMatrix.elements[ 12 ] ) );
					_sprite.scale.y = object.scale.y * Math.abs( _sprite.y - ( _vector4.y + camera.projectionMatrix.elements[ 5 ] ) / ( _vector4.w + camera.projectionMatrix.elements[ 13 ] ) );

					_sprite.material = object.material;

					_renderData.elements.push( _sprite );

				}

			}

		}

		if ( sortElements === true ) {

			_renderData.elements.sort( painterSort );

		}

		return _renderData;

	};

	// Pools

	function getNextObjectInPool() {

		if ( _objectCount === _objectPoolLength ) {

			var object = new THREE.RenderableObject();
			_objectPool.push( object );
			_objectPoolLength ++;
			_objectCount ++;
			return object;

		}

		return _objectPool[ _objectCount ++ ];

	}

	function getNextVertexInPool() {

		if ( _vertexCount === _vertexPoolLength ) {

			var vertex = new THREE.RenderableVertex();
			_vertexPool.push( vertex );
			_vertexPoolLength ++;
			_vertexCount ++;
			return vertex;

		}

		return _vertexPool[ _vertexCount ++ ];

	}

	function getNextFaceInPool() {

		if ( _faceCount === _facePoolLength ) {

			var face = new THREE.RenderableFace();
			_facePool.push( face );
			_facePoolLength ++;
			_faceCount ++;
			return face;

		}

		return _facePool[ _faceCount ++ ];


	}

	function getNextLineInPool() {

		if ( _lineCount === _linePoolLength ) {

			var line = new THREE.RenderableLine();
			_linePool.push( line );
			_linePoolLength ++;
			_lineCount ++;
			return line;

		}

		return _linePool[ _lineCount ++ ];

	}

	function getNextSpriteInPool() {

		if ( _spriteCount === _spritePoolLength ) {

			var sprite = new THREE.RenderableSprite();
			_spritePool.push( sprite );
			_spritePoolLength ++;
			_spriteCount ++;
			return sprite;

		}

		return _spritePool[ _spriteCount ++ ];

	}

	//

	function painterSort( a, b ) {

		if ( a.renderOrder !== b.renderOrder ) {

			return a.renderOrder - b.renderOrder;

		} else if ( a.z !== b.z ) {

			return b.z - a.z;

		} else if ( a.id !== b.id ) {

			return a.id - b.id;

		} else {

			return 0;

		}

	}

	function clipLine( s1, s2 ) {

		var alpha1 = 0, alpha2 = 1,

		// Calculate the boundary coordinate of each vertex for the near and far clip planes,
		// Z = -1 and Z = +1, respectively.
		bc1near =  s1.z + s1.w,
		bc2near =  s2.z + s2.w,
		bc1far =  - s1.z + s1.w,
		bc2far =  - s2.z + s2.w;

		if ( bc1near >= 0 && bc2near >= 0 && bc1far >= 0 && bc2far >= 0 ) {

			// Both vertices lie entirely within all clip planes.
			return true;

		} else if ( ( bc1near < 0 && bc2near < 0 ) || ( bc1far < 0 && bc2far < 0 ) ) {

			// Both vertices lie entirely outside one of the clip planes.
			return false;

		} else {

			// The line segment spans at least one clip plane.

			if ( bc1near < 0 ) {

				// v1 lies outside the near plane, v2 inside
				alpha1 = Math.max( alpha1, bc1near / ( bc1near - bc2near ) );

			} else if ( bc2near < 0 ) {

				// v2 lies outside the near plane, v1 inside
				alpha2 = Math.min( alpha2, bc1near / ( bc1near - bc2near ) );

			}

			if ( bc1far < 0 ) {

				// v1 lies outside the far plane, v2 inside
				alpha1 = Math.max( alpha1, bc1far / ( bc1far - bc2far ) );

			} else if ( bc2far < 0 ) {

				// v2 lies outside the far plane, v2 inside
				alpha2 = Math.min( alpha2, bc1far / ( bc1far - bc2far ) );

			}

			if ( alpha2 < alpha1 ) {

				// The line segment spans two boundaries, but is outside both of them.
				// (This can't happen when we're only clipping against just near/far but good
				//  to leave the check here for future usage if other clip planes are added.)
				return false;

			} else {

				// Update the s1 and s2 vertices to match the clipped line segment.
				s1.lerp( s2, alpha1 );
				s2.lerp( s1, 1 - alpha2 );

				return true;

			}

		}

	}

};

// == gviz/renderer.js ==

/**
 * @author mrdoob / http://mrdoob.com/
 */

// var THREE = require('three')



THREE.SpriteCanvasMaterial = function ( parameters ) {

	THREE.Material.call( this );

	this.type = 'SpriteCanvasMaterial';

	this.color = new THREE.Color( 0xffffff );
	this.program = function ( context, color ) {};

	this.setValues( parameters );

};

THREE.SpriteCanvasMaterial.prototype = Object.create( THREE.Material.prototype );
THREE.SpriteCanvasMaterial.prototype.constructor = THREE.SpriteCanvasMaterial;

THREE.SpriteCanvasMaterial.prototype.clone = function () {

	var material = new THREE.SpriteCanvasMaterial();

	material.copy( this );
	material.color.copy( this.color );
	material.program = this.program;

	return material;

};

gviz.GraphRenderer = function ( parameters ) {

    console.log( 'gviz.CanvasRenderer based on THREE ', THREE.REVISION );


    var smoothstep = THREE.Math.smoothstep;

    parameters = parameters || {};

    var _this = this,
    _renderData, _elements, _lights,
    _projector = new THREE.Projector(),

    _canvas = parameters.canvas !== undefined
        ? parameters.canvas
        : document.createElement( 'canvas' ),

    _canvasWidth = _canvas.width,
    _canvasHeight = _canvas.height,
    _canvasWidthHalf = Math.floor( _canvasWidth / 2 ),
    _canvasHeightHalf = Math.floor( _canvasHeight / 2 ),

    _context = _canvas.getContext( '2d', {
        alpha: parameters.alpha === true
    } ),

    _clearColor = new THREE.Color( 0x000000 ),
    _clearAlpha = 0,

    _contextGlobalAlpha = 1,
    _contextGlobalCompositeOperation = 0,
    _contextStrokeStyle = null,
    _contextFillStyle = null,
    _contextLineWidth = null,
    _contextLineCap = null,
    _contextLineJoin = null,
    _contextDashSize = null,
    _contextGapSize = 0,

    _camera,

    _v1, _v2, _v3, _v4,
    _v5 = new THREE.RenderableVertex(),
    _v6 = new THREE.RenderableVertex(),

    _v1x, _v1y, _v2x, _v2y, _v3x, _v3y,
    _v4x, _v4y, _v5x, _v5y, _v6x, _v6y,

    _color = new THREE.Color(),
    _color1 = new THREE.Color(),
    _color2 = new THREE.Color(),
    _color3 = new THREE.Color(),
    _color4 = new THREE.Color(),

    _diffuseColor = new THREE.Color(),
    _emissiveColor = new THREE.Color(),

    _lightColor = new THREE.Color(),

    _patterns = {},

    _near, _far,

    _image, _uvs,
    _uv1x, _uv1y, _uv2x, _uv2y, _uv3x, _uv3y,

    _clipBox = new THREE.Box2(),
    _clearBox = new THREE.Box2(),
    _elemBox = new THREE.Box2(),

    _ambientLight = new THREE.Color(),
    _directionalLights = new THREE.Color(),
    _pointLights = new THREE.Color(),

    _vector3 = new THREE.Vector3(), // Needed for PointLight
    _normal = new THREE.Vector3(),
    _normalViewMatrix = new THREE.Matrix3(),

    _pixelMap, _pixelMapContext, _pixelMapImage, _pixelMapData,
    _gradientMap, _gradientMapContext, _gradientMapQuality = 16;

    _pixelMap = document.createElement( 'canvas' );
    _pixelMap.width = _pixelMap.height = 2;

    _pixelMapContext = _pixelMap.getContext( '2d' );
    _pixelMapContext.fillStyle = 'rgba(0,0,0,1)';
    _pixelMapContext.fillRect( 0, 0, 2, 2 );

    _pixelMapImage = _pixelMapContext.getImageData( 0, 0, 2, 2 );
    _pixelMapData = _pixelMapImage.data;

    _gradientMap = document.createElement( 'canvas' );
    _gradientMap.width = _gradientMap.height = _gradientMapQuality;

    _gradientMapContext = _gradientMap.getContext( '2d' );
    _gradientMapContext.translate( - _gradientMapQuality / 2, - _gradientMapQuality / 2 );
    _gradientMapContext.scale( _gradientMapQuality, _gradientMapQuality );

    _gradientMapQuality --; // Fix UVs

    // dash+gap fallbacks for Firefox and everything else

    // add options
    this.DISPLAY_EDGE = true; // display text on edges
    this.DISPLAY_EDGE_LABEL = true; // display text on edges
    this.DISPLAY_ARROW_INIT = true; // display arrow init
    this.DISPLAY_ARROW_END = true; // display arrow end
    this.ENABLE_FOG = true; // display arrow end

    if ( _context.setLineDash === undefined ) {

        if ( _context.mozDash !== undefined ) {

            _context.setLineDash = function ( values ) {

                _context.mozDash = values[ 0 ] !== null ? values : null;

            }

        } else {

            _context.setLineDash = function () {}

        }

    }

    this.domElement = _canvas;

    this.devicePixelRatio = parameters.devicePixelRatio !== undefined
        ? parameters.devicePixelRatio
        : self.devicePixelRatio !== undefined
        ? self.devicePixelRatio
        : 1;

    this.autoClear = true;
    this.sortObjects = true;
    this.sortElements = true;

    this.info = {

        render: {

            vertices: 0,
            faces: 0

        }

    }

    // WebGLRenderer compatibility

    this.supportsVertexTextures = function () {};
    this.setFaceCulling = function () {};

    this.setSize = function ( width, height, updateStyle ) {

        _canvasWidth = width * this.devicePixelRatio;
        _canvasHeight = height * this.devicePixelRatio;

        _canvasWidthHalf = Math.floor( _canvasWidth / 2 );
        _canvasHeightHalf = Math.floor( _canvasHeight / 2 );

        _canvas.width = _canvasWidth;
        _canvas.height = _canvasHeight;

        if ( this.devicePixelRatio !== 1 && updateStyle !== false ) {

            _canvas.style.width = width + 'px';
            _canvas.style.height = height + 'px';

        }

        _clipBox.min.set( - _canvasWidthHalf, - _canvasHeightHalf ),
        _clipBox.max.set(   _canvasWidthHalf,   _canvasHeightHalf );

        _clearBox.min.set( - _canvasWidthHalf, - _canvasHeightHalf );
        _clearBox.max.set(   _canvasWidthHalf,   _canvasHeightHalf );

        _contextGlobalAlpha = 1;
        _contextGlobalCompositeOperation = 0;
        _contextStrokeStyle = null;
        _contextFillStyle = null;
        _contextLineWidth = null;
        _contextLineCap = null;
        _contextLineJoin = null;

    };

    this.setClearColor = function ( color, alpha ) {

        _clearColor.set( color );
        _clearAlpha = alpha !== undefined ? alpha : 1;

        _clearBox.min.set( - _canvasWidthHalf, - _canvasHeightHalf );
        _clearBox.max.set(   _canvasWidthHalf,   _canvasHeightHalf );

    };

    this.setClearColorHex = function ( hex, alpha ) {

        console.warn( 'DEPRECATED: .setClearColorHex() is being removed. Use .setClearColor() instead.' );
        this.setClearColor( hex, alpha );

    };

    this.getMaxAnisotropy = function () {

        return 0;

    };

    this.clear = function () {

        _context.setTransform( 1, 0, 0, - 1, _canvasWidthHalf, _canvasHeightHalf );

        if ( _clearBox.isEmpty() === false ) {

            _clearBox.intersect( _clipBox );
            _clearBox.expandByScalar( 2 );

            if ( _clearAlpha < 1 ) {

                _context.clearRect(
                    _clearBox.min.x | 0,
                    _clearBox.min.y | 0,
                    ( _clearBox.max.x - _clearBox.min.x ) | 0,
                    ( _clearBox.max.y - _clearBox.min.y ) | 0
                );

            }

            if ( _clearAlpha > 0 ) {

                setBlending( THREE.NormalBlending );
                setOpacity( 1 );

                setFillStyle( 'rgba(' + Math.floor( _clearColor.r * 255 ) + ',' + Math.floor( _clearColor.g * 255 ) + ',' + Math.floor( _clearColor.b * 255 ) + ',' + _clearAlpha + ')' );

                _context.fillRect(
                    _clearBox.min.x | 0,
                    _clearBox.min.y | 0,
                    ( _clearBox.max.x - _clearBox.min.x ) | 0,
                    ( _clearBox.max.y - _clearBox.min.y ) | 0
                );

            }

            _clearBox.makeEmpty();

        }

    };

    // compatibility

    this.clearColor = function () {};
    this.clearDepth = function () {};
    this.clearStencil = function () {};

    this.render = function ( scene, camera ) {

        if ( camera instanceof THREE.Camera === false ) {

            console.error( 'THREE.CanvasRenderer.render: camera is not an instance of THREE.Camera.' );
            return;

        }

        if ( this.autoClear === true ) this.clear();

        _context.setTransform( 1, 0, 0, - 1, _canvasWidthHalf, _canvasHeightHalf );

        _this.info.render.vertices = 0;
        _this.info.render.faces = 0;

        _renderData = _projector.projectScene( scene, camera, this.sortObjects, this.sortElements );
        // sorted elements rerank object for first layer on mouseover ...
        _elements = _renderData.elements;

        _lights = _renderData.lights;
        _camera = camera;

        _normalViewMatrix.getNormalMatrix( camera.matrixWorldInverse );

        /* DEBUG
           setFillStyle( 'rgba( 0, 255, 255, 0.5 )' );
           _context.fillRect( _clipBox.min.x, _clipBox.min.y, _clipBox.max.x - _clipBox.min.x, _clipBox.max.y - _clipBox.min.y );
        */

        for ( var e = 0, el = _elements.length; e < el; e ++ ) {

            var element = _elements[ e ];
            var material = element.material;

            if ( material === undefined || material.visible === false ) continue;

            _elemBox.makeEmpty();

            if ( element instanceof THREE.RenderableSprite ) {

                _v1 = element;
                _v1.x *= _canvasWidthHalf; _v1.y *= _canvasHeightHalf;

                element.object.x = _v1.x;
                element.object.y = _v1.y;

                var vector = new THREE.Vector3();
                vector.setFromMatrixPosition( element.object.matrixWorld )
                vector.project( camera );
                vector.x = ( vector.x * _canvasWidthHalf ) + _canvasWidthHalf;
                vector.y = - ( vector.y * _canvasHeightHalf ) + _canvasHeightHalf;
                
                element.object.screenX = vector.x;
                element.object.screenY = vector.y;
                
                renderSprite( _v1, element, material );

            } else if ( element instanceof THREE.RenderableLine ) {

                _v1 = element.v1; _v2 = element.v2;

                _v1.positionScreen.x *= _canvasWidthHalf; _v1.positionScreen.y *= _canvasHeightHalf;
                _v2.positionScreen.x *= _canvasWidthHalf; _v2.positionScreen.y *= _canvasHeightHalf;

                _elemBox.setFromPoints( [
                    _v1.positionScreen,
                    _v2.positionScreen
                ] );

                if ( _clipBox.intersectsBox( _elemBox ) === true ) {

                    renderLine( _v1, _v2, element, material );

                }

            } else if ( element instanceof THREE.RenderableFace ) {

                _v1 = element.v1; _v2 = element.v2; _v3 = element.v3;

                if ( _v1.positionScreen.z < -1 || _v1.positionScreen.z > 1 ) continue;
                if ( _v2.positionScreen.z < -1 || _v2.positionScreen.z > 1 ) continue;
                if ( _v3.positionScreen.z < -1 || _v3.positionScreen.z > 1 ) continue;

                _v1.positionScreen.x *= _canvasWidthHalf; _v1.positionScreen.y *= _canvasHeightHalf;
                _v2.positionScreen.x *= _canvasWidthHalf; _v2.positionScreen.y *= _canvasHeightHalf;
                _v3.positionScreen.x *= _canvasWidthHalf; _v3.positionScreen.y *= _canvasHeightHalf;

                if ( material.overdraw > 0 ) {

                    expand( _v1.positionScreen, _v2.positionScreen, material.overdraw );
                    expand( _v2.positionScreen, _v3.positionScreen, material.overdraw );
                    expand( _v3.positionScreen, _v1.positionScreen, material.overdraw );

                }

                _elemBox.setFromPoints( [
                    _v1.positionScreen,
                    _v2.positionScreen,
                    _v3.positionScreen
                ] );

                if ( _clipBox.intersectsBox( _elemBox ) === true ) {

                    renderFace3( _v1, _v2, _v3, 0, 1, 2, element, material );

                }

            }

            /* DEBUG
               setLineWidth( 1 );
               setStrokeStyle( 'rgba( 0, 255, 0, 0.5 )' );
               _context.strokeRect( _elemBox.min.x, _elemBox.min.y, _elemBox.max.x - _elemBox.min.x, _elemBox.max.y - _elemBox.min.y );
            */

            _clearBox.union( _elemBox );

        }

        /* DEBUG
           setLineWidth( 1 );
           setStrokeStyle( 'rgba( 255, 0, 0, 0.5 )' );
           _context.strokeRect( _clearBox.min.x, _clearBox.min.y, _clearBox.max.x - _clearBox.min.x, _clearBox.max.y - _clearBox.min.y );
        */

        _context.setTransform( 1, 0, 0, 1, 0, 0 );

        

    };

    //

    function renderSprite( v1, element, material ) {

        setOpacity( material.opacity );
        setBlending( material.blending );

        var scaleX = element.scale.x * _canvasWidthHalf;
        var scaleY = element.scale.y * _canvasHeightHalf;


        var dist = 0.5 * Math.sqrt( scaleX * scaleX + scaleY * scaleY ); // allow for rotated sprite
        _elemBox.min.set( v1.x - dist, v1.y - dist );
        _elemBox.max.set( v1.x + dist, v1.y + dist );

        if ( material instanceof THREE.SpriteMaterial ||
             material instanceof THREE.ParticleSystemMaterial ) { // Backwards compatibility

            var texture = material.map;

            if ( texture !== null ) {

                if ( texture.hasEventListener( 'update', onTextureUpdate ) === false ) {

                    if ( texture.image !== undefined && texture.image.width > 0 ) {

                        textureToPattern( texture );

                    }

                    texture.addEventListener( 'update', onTextureUpdate );

                }

                var pattern = _patterns[ texture.id ];

                if ( pattern !== undefined ) {

                    setFillStyle( pattern );

                } else {

                    setFillStyle( 'rgba( 0, 0, 0, 1 )' );

                }

                //

                var bitmap = texture.image;

                var ox = bitmap.width * texture.offset.x;
                var oy = bitmap.height * texture.offset.y;

                var sx = bitmap.width * texture.repeat.x;
                var sy = bitmap.height * texture.repeat.y;

                var cx = scaleX / sx;
                var cy = scaleY / sy;

                _context.save();
                _context.translate( v1.x, v1.y );
                if ( material.rotation !== 0 ) _context.rotate( material.rotation );
                _context.translate( - scaleX / 2, - scaleY / 2 );
                _context.scale( cx, cy );
                _context.translate( - ox, - oy );
                _context.fillRect( ox, oy, sx, sy );
                _context.restore();

            } else { // no texture

                setFillStyle( material.color.getStyle() );

                _context.save();
                _context.translate( v1.x, v1.y );
                if ( material.rotation !== 0 ) _context.rotate( material.rotation );
                _context.scale( scaleX, - scaleY );
                _context.fillRect( - 0.5, - 0.5, 1, 1 );
                _context.restore();

            }

        } else if ( material instanceof THREE.SpriteCanvasMaterial ) {

            setStrokeStyle( material.color.getStyle() );
            setFillStyle( material.color.getStyle() );

            _context.save();
            _context.translate( v1.x, v1.y );
            if ( material.rotation !== 0 ) _context.rotate( material.rotation );
            _context.scale( scaleX, scaleY );

            material.program( _context );

            _context.restore();

        }

        /* DEBUG
           setStrokeStyle( 'rgb(255,255,0)' );
           _context.beginPath();
           _context.moveTo( v1.x - 10, v1.y );
           _context.lineTo( v1.x + 10, v1.y );
           _context.moveTo( v1.x, v1.y - 10 );
           _context.lineTo( v1.x, v1.y + 10 );
           _context.stroke();
        */

    }

    function renderLine( v1, v2, element, material ) {

        setOpacity( material.opacity );
        setBlending( material.blending );
        setLineWidth( material.linewidth );
        setLineCap( material.linecap );
        setLineJoin( material.linejoin);

        
        if ( _this.DISPLAY_EDGE == false ) return ;
        if ( material.opacity == 0.  ) return ;
        
        var source = element.object._edge.source;
        var target = element.object._edge.target;

        if ( ! source || ! target ) return;

        var x = v2.positionScreen.x - v1.positionScreen.x;
        var y = v2.positionScreen.y - v1.positionScreen.y;

        // we don't render loops
        if (x == 0 && y == 0) return;

        var x1 = v1.positionScreen.x,
            x2 = v2.positionScreen.x,
            y1 = v1.positionScreen.y,
            y2 = v2.positionScreen.y;

        var inverted = ( x1 < x2 );
        var dist = Math.sqrt( Math.pow(x , 2) + Math.pow( y, 2) );
        var rotation = Math.atan( (y2-y1)/(x2-x1) );

        if ( x1 == x2 ) {
            if ( (y2-y1) > 0 ) rotation = rotation + Math.PI / 2
            else if ( y2<y1)  rotation = rotation -  Math.PI / 2
        }
        else if (x1 > x2){
            rotation = rotation + Math.PI;
        }

        // == context transformation ==
        _context.save();

        _context.translate( v1.positionScreen.x, v1.positionScreen.y + 5 );
        _context.rotate( rotation );
        _context.scale(1, -1);

        // == line material == 
        var opacity = material.opacity;

        // fog opacity
        //if( _this.ENABLE_FOG && element.object._edge.flags[1]==null)
        //{
            //var opacityFactor = Math.min(element.object._edge.source._opacityFactor, element.object._edge.target._opacityFactor);
            //if (opacityFactor)
                //opacity = material.opacity * opacityFactor;
        //}

        if ( material.vertexColors !== THREE.VertexColors ) {

            _context.strokeStyle = material.color.getStyle();

        } else {

            var colorStyle1 = element.vertexColors[0].getStyle();
            var colorStyle2 = element.vertexColors[1].getStyle();

            if ( colorStyle1 === colorStyle2 ) {
                _context.strokeStyle = colorStyle1;
            } else {

                try {
                    var grad = _context.createLinearGradient(0,0,dist,0);
                    grad.addColorStop( 0, colorStyle1 );
                    grad.addColorStop( 1, colorStyle2 );
                } catch ( exception ) {
                    grad = colorStyle1;
                }
                _context.strokeStyle = grad ;
            }
        }
        
        if (material.lineType == "dashed")
            _context.setLineDash( [ material.dashSize, material.gapSize ] );
        else
            _context.setLineDash( [] );
        
        // path
        _context.beginPath();
        _context.moveTo( 0, 0 );
        _context.lineTo( dist  , 0 );
        _context.closePath();

        // stroke line & reset dash and gap

        _context.stroke();
        
        _elemBox.expandByScalar( material.linewidth * 2 );
        _context.setLineDash( [] );


        // display edge label
        var edgeLabel = "";
        _context.translate(dist/2, 0);
        if(_this.DISPLAY_EDGE_LABEL && material.label_visible)
        {
            _context.save();

            edgeLabel = element.object._edge.label;
            if (!edgeLabel) 
            {
                if(inverted)
                {
                    edgeLabel = target.label + " <--- " + source.label;
                }
                else
                {
                    edgeLabel = source.label + " ---> " + target.label;
                }
            }

            if(! inverted)
                _context.scale(-1,-1);

            _context.textAlign = material.textAlign;
            _context.font = material.font;
            _context.fillStyle = material.fontFillStyle;
            _context.fillText(edgeLabel , 0,-2);
            _context.restore();
        }

        var scale = 3;
        if(_this.DISPLAY_ARROW_END && material.orientation_visible)
        {
            var dec = 2 * 0.8 * (target._scale /target._distance *1000 + scale);

            _context.save();
            _context.translate(-dist/2 + dec, 0);
            _context.scale(-scale, -scale);
            setStrokeStyle( colorStyle2 );
            drawTriangle(0,0.5, 0,-0.5, 1, 0 );
            _context.stroke();
            _context.restore();
        }

        if(_this.DISPLAY_ARROW_INIT && material.orientation_visible)
        {
            var dec = 2 * 0.8 * (source._scale /source._distance *1000 + scale) + 5;
            _context.save();
            _context.translate(dist/2 - dec , 0);
            _context.scale(-scale, -scale);
            setStrokeStyle( colorStyle1 );
            drawTriangle(0,0.5, 0,-0.5, 1, 0 );
            _context.stroke();
            _context.restore();
        }
        
        _context.restore();

    }

    //

    function drawTriangle( x0, y0, x1, y1, x2, y2 ) {

        _context.beginPath();
        _context.moveTo( x0, y0 );
        _context.lineTo( x1, y1 );
        _context.lineTo( x2, y2 );
        _context.closePath();

    }

    function strokePath( color, linewidth, linecap, linejoin ) {

        setLineWidth( linewidth );
        setLineCap( linecap );
        setLineJoin( linejoin );
        setStrokeStyle( color.getStyle() );

        _context.stroke();

        _elemBox.expandByScalar( linewidth * 2 );

    }

    function fillPath( color ) {

        setFillStyle( color.getStyle() );
        _context.fill();

    }

    function onTextureUpdate ( event ) {

        textureToPattern( event.target );

    }

    function textureToPattern( texture ) {

        var repeatX = texture.wrapS === THREE.RepeatWrapping;
        var repeatY = texture.wrapT === THREE.RepeatWrapping;

        var image = texture.image;

        var canvas = document.createElement( 'canvas' );
        canvas.width = image.width;
        canvas.height = image.height;

        var context = canvas.getContext( '2d' );
        context.setTransform( 1, 0, 0, - 1, 0, image.height );
        context.drawImage( image, 0, 0 );

        _patterns[ texture.id ] = _context.createPattern(
            canvas, repeatX === true && repeatY === true
                ? 'repeat'
                : repeatX === true && repeatY === false
                ? 'repeat-x'
                : repeatX === false && repeatY === true
                ? 'repeat-y'
                : 'no-repeat'
        );

    }

    function patternPath( x0, y0, x1, y1, x2, y2, u0, v0, u1, v1, u2, v2, texture ) {

        if ( texture instanceof THREE.DataTexture ) return;

        if ( texture.hasEventListener( 'update', onTextureUpdate ) === false ) {

            if ( texture.image !== undefined && texture.image.width > 0 ) {

                textureToPattern( texture );

            }

            texture.addEventListener( 'update', onTextureUpdate );

        }

        var pattern = _patterns[ texture.id ];

        if ( pattern !== undefined ) {

            setFillStyle( pattern );

        } else {

            setFillStyle( 'rgba(0,0,0,1)' );
            _context.fill();

            return;

        }

        // http://extremelysatisfactorytotalitarianism.com/blog/?p=2120

        var a, b, c, d, e, f, det, idet,
        offsetX = texture.offset.x / texture.repeat.x,
        offsetY = texture.offset.y / texture.repeat.y,
        width = texture.image.width * texture.repeat.x,
        height = texture.image.height * texture.repeat.y;

        u0 = ( u0 + offsetX ) * width;
        v0 = ( v0 + offsetY ) * height;

        u1 = ( u1 + offsetX ) * width;
        v1 = ( v1 + offsetY ) * height;

        u2 = ( u2 + offsetX ) * width;
        v2 = ( v2 + offsetY ) * height;

        x1 -= x0; y1 -= y0;
        x2 -= x0; y2 -= y0;

        u1 -= u0; v1 -= v0;
        u2 -= u0; v2 -= v0;

        det = u1 * v2 - u2 * v1;

        if ( det === 0 ) return;

        idet = 1 / det;

        a = ( v2 * x1 - v1 * x2 ) * idet;
        b = ( v2 * y1 - v1 * y2 ) * idet;
        c = ( u1 * x2 - u2 * x1 ) * idet;
        d = ( u1 * y2 - u2 * y1 ) * idet;

        e = x0 - a * u0 - c * v0;
        f = y0 - b * u0 - d * v0;

        _context.save();
        _context.transform( a, b, c, d, e, f );
        _context.fill();
        _context.restore();

    }

    function clipImage( x0, y0, x1, y1, x2, y2, u0, v0, u1, v1, u2, v2, image ) {

        // http://extremelysatisfactorytotalitarianism.com/blog/?p=2120

        var a, b, c, d, e, f, det, idet,
        width = image.width - 1,
        height = image.height - 1;

        u0 *= width; v0 *= height;
        u1 *= width; v1 *= height;
        u2 *= width; v2 *= height;

        x1 -= x0; y1 -= y0;
        x2 -= x0; y2 -= y0;

        u1 -= u0; v1 -= v0;
        u2 -= u0; v2 -= v0;

        det = u1 * v2 - u2 * v1;

        idet = 1 / det;

        a = ( v2 * x1 - v1 * x2 ) * idet;
        b = ( v2 * y1 - v1 * y2 ) * idet;
        c = ( u1 * x2 - u2 * x1 ) * idet;
        d = ( u1 * y2 - u2 * y1 ) * idet;

        e = x0 - a * u0 - c * v0;
        f = y0 - b * u0 - d * v0;

        _context.save();
        _context.transform( a, b, c, d, e, f );
        _context.clip();
        _context.drawImage( image, 0, 0 );
        _context.restore();

    }

    function getGradientTexture( color1, color2, color3, color4 ) {

        // http://mrdoob.com/blog/post/710

        _pixelMapData[ 0 ] = ( color1.r * 255 ) | 0;
        _pixelMapData[ 1 ] = ( color1.g * 255 ) | 0;
        _pixelMapData[ 2 ] = ( color1.b * 255 ) | 0;

        _pixelMapData[ 4 ] = ( color2.r * 255 ) | 0;
        _pixelMapData[ 5 ] = ( color2.g * 255 ) | 0;
        _pixelMapData[ 6 ] = ( color2.b * 255 ) | 0;

        _pixelMapData[ 8 ] = ( color3.r * 255 ) | 0;
        _pixelMapData[ 9 ] = ( color3.g * 255 ) | 0;
        _pixelMapData[ 10 ] = ( color3.b * 255 ) | 0;

        _pixelMapData[ 12 ] = ( color4.r * 255 ) | 0;
        _pixelMapData[ 13 ] = ( color4.g * 255 ) | 0;
        _pixelMapData[ 14 ] = ( color4.b * 255 ) | 0;

        _pixelMapContext.putImageData( _pixelMapImage, 0, 0 );
        _gradientMapContext.drawImage( _pixelMap, 0, 0 );

        return _gradientMap;

    }

    // Hide anti-alias gaps

    function expand( v1, v2, pixels ) {

        var x = v2.x - v1.x, y = v2.y - v1.y,
        det = x * x + y * y, idet;

        if ( det === 0 ) return;

        idet = pixels / Math.sqrt( det );

        x *= idet; y *= idet;

        v2.x += x; v2.y += y;
        v1.x -= x; v1.y -= y;

    }

    // Context cached methods.

    function setOpacity( value ) {

        if ( _contextGlobalAlpha !== value ) {

            _context.globalAlpha = value;
            _contextGlobalAlpha = value;

        }

    }

    function setBlending( value ) {

        if ( _contextGlobalCompositeOperation !== value ) {

            if ( value === THREE.NormalBlending ) {

                _context.globalCompositeOperation = 'source-over';

            } else if ( value === THREE.AdditiveBlending ) {

                _context.globalCompositeOperation = 'lighter';

            } else if ( value === THREE.SubtractiveBlending ) {

                _context.globalCompositeOperation = 'darker';

            }

            _contextGlobalCompositeOperation = value;

        }

    }

    function setLineWidth( value ) {

        if ( _contextLineWidth !== value ) {

            _context.lineWidth = value;
            _contextLineWidth = value;

        }

    }

    function setLineCap( value ) {

        // "butt", "round", "square"

        if ( _contextLineCap !== value ) {

            _context.lineCap = value;
            _contextLineCap = value;

        }

    }

    function setLineJoin( value ) {

        // "round", "bevel", "miter"

        if ( _contextLineJoin !== value ) {

            _context.lineJoin = value;
            _contextLineJoin = value;

        }

    }

    function setStrokeStyle( value ) {

        if ( _contextStrokeStyle !== value ) {

            _context.strokeStyle = value;
            _contextStrokeStyle = value;

        }

    }

    function setFillStyle( value ) {

        if ( _contextFillStyle !== value ) {

            _context.fillStyle = value;
            _contextFillStyle = value;

        }

    }


};

// == gviz/layout.force_directed.js ==

// Runs a force-directed layout algorithm on the currently displayed graph

gviz.Layout.ForceDirected = {


    run: function (graph, options) {
        var iterations, forceStrength, dampening, maxVelocity, maxDistance,
            iterate, self, l, i, j, k, delta, mag, n1, n2, e, a;
        self = graph;

        options = options || {};
        iterations = options.hasOwnProperty("iterations") ? options.iterations : 10000;
        forceStrength = options.hasOwnProperty("forceStrength") ? options.forceStrength : 10.0;
        dampening = 0.01;
        maxVelocity = 2.0;
        maxDistance = 50;
        delta = new THREE.Vector3();

        
        graph.vs.each( function(node){
            node.position = new THREE.Vector3(Math.random(), Math.random(), Math.random());
            node.force = new THREE.Vector3(Math.random(), Math.random(), Math.random());
        });

        iterate = function () {
            dampening -= 0.01 / iterations;

            // Add in Coulomb-esque node-node repulsive forces
            var nodes = graph.vs.elements;
            var edges = graph.vs.elements;
            
            for (j = 0; j < nodes.length; j += 1) {
                for (k = 0; k < nodes.length; k += 1) {
                    if (j === k) {
                        continue;
                    }
                    n1 = nodes[j];
                    n2 = nodes[k];

                    delta.subVectors(n2.position, n1.position);
                    mag = delta.length();
                    if (mag < 0.1) {
                        delta.set(Math.random(), Math.random(), Math.random())
                             .multiplyScalar(0.1).addScalar(0.1);
                        mag = delta.length();
                    }
                    if (mag < maxDistance) {
                        delta.multiplyScalar(forceStrength * forceStrength / (mag * mag));
                        n1.force.sub(delta.clone().multiplyScalar(n2.scale.x));
                        n2.force.add(delta.clone().multiplyScalar(n1.scale.x));
                    }
                }
            }

            // Add Hooke-esque edge spring forces
            for (j = 0; j < edges.length; j += 1) {
                n1 = nodes[edges[j].source];
                n2 = nodes[edges[j].target];

                delta.subVectors(n2.position, n1.position);
                mag = delta.length();
                if (mag < 0.1) {
                    delta.set(THREE.Math.randFloat(0.1, 0.2),
                              THREE.Math.randFloat(0.1, 0.2),
                              THREE.Math.randFloat(0.1, 0.2));
                    mag = delta.length();
                }
                mag = Math.min(mag, maxDistance);
                delta.multiplyScalar((mag * mag - forceStrength * forceStrength) / (mag * forceStrength));
                n1.force.add(delta.clone().multiplyScalar(n2.scale.x));
                n2.force.sub(delta.clone().multiplyScalar(n1.scale.x));
            }

            // Move by resultant force
            for (j = 0; j < nodes.length; j += 1) {
                n1 = nodes[j];
                n1.force.multiplyScalar(dampening);
                n1.force.setX(THREE.Math.clamp(n1.force.x, -maxVelocity, maxVelocity));
                n1.force.setY(THREE.Math.clamp(n1.force.y, -maxVelocity, maxVelocity));
                n1.force.setZ(THREE.Math.clamp(n1.force.z, -maxVelocity, maxVelocity));

                n1.position.add(n1.force);
                n1.force.set(0, 0, 0);
            }
            for (j = 0; j < edges.length; j += 1) {
                e = edges[j];
                n1 = nodes[e.source];
                n2 = nodes[e.target];
                mag = n2.position.distanceTo(n1.position);
                e.position.addVectors(n1.position, n2.position).divideScalar(2.0);
                e.lookAt(n2.position);
                e.scale.z = mag;
                if (self.directed) {
                    a = self.arrows[j];
                    a.position.copy(e.position);
                    a.lookAt(n2.position);
                }
            }
        };

        for (i = 0; i < iterations; i += 1) {
            setTimeout(iterate, 0);
        }
    }
};

    return Gviz;
}))
