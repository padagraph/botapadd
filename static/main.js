// Filename: main.js

// Require.js allows us to configure shortcut alias
// There usage will become more apparent further along in the tutorial.
var path = "../static/bower_components/"

 require.config({
      waitSeconds: 0,
      paths: {

        //underscore : path + 'underscore/underscore-min',
        //backbone   : path + 'backbone/backbone-min',
        //jquery     : path + 'jquery/dist/jquery.min',
        
        //cello     : 'cello.min',
        //gviz      : 'gviz.min',
        //embed     : 'embed.min',
        
        cello     : 'cello',
        gviz      : 'gviz',
        embed     : 'embed',     
        
        threejs   : 'three',
        numeric   : 'numeric-1.2.6',
        //tween     : 'tween',
        //materials : 'materials',
        //pdgconst  : 'pdgconst',

        //mousetrap : 'mousetrap',
        //moment    : 'moment',
        //json2html    : 'json2html',

      },
      
      shim: {
          // threejs not require compatible...
          'threejs': {
                exports: 'THREE',
            },
          
          'json2html': {
                exports: 'json2html',
            },
          'semantic': {
              deps: ['jquery']
          },
        }
    });

