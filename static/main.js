// Filename: main.js

 require.config({
      waitSeconds: 0,
      paths: {

        //underscore : path + 'underscore/underscore-min',
        //backbone   : path + 'backbone/backbone-min',
        //jquery     : path + 'jquery/dist/jquery.min',
                
        cello     : 'cello.min',
        gviz      : 'gviz.min',
        embed     : 'embed.min',     
        
        threejs   : 'three.min',
        numeric   : 'numeric-1.2.6.min',
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

