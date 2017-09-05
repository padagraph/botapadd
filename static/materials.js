!!!define([], function() {


    Materials =  {
        'edge' : [
            {'default' : {
                'lineWidth'  : 2,
                'color'    : "#666",
                'opacity'  : 1, //.4
                'label_visible' : false,
                'fontColor': "#4C4D00",
                'textAlign': "center",
                'orientation_visible' : false,
                'label_visible' : false,

                //'lineType' : "dashed",
                //'dashSize' : 2,
                //'gapSize'  : 5,
                'lineType' : "plain",

            }},

            { '.es-cluster-faded': {
                'lineWidth'  : 1,
                'opacity'    : 0.2,
            } },

            { '.es-mo-faded': {
                'lineWidth'  : 1,
                'opacity'    : 0.2,
            }
            },

            { '.es-sel-faded': {
                'lineWidth'  : 1,
                'opacity'    : 0.2,
            }
            },


            { '.es-mo-adjacent': {
                    'lineWidth'  : 2,
                    'opacity'    : 1,
                    //'label_visible' : true,
                    //'orientation_visible' : true,
                    'lineType' : "plain",
                }
            },

            { '.es-sel-adjacent': {
                    'lineWidth'  : 2,
                    'opacity'    : 1,
                    'label_visible' : false,
                    //'orientation_visible' : true,
                }
            },


            {  '.es-bolder': {
                    'lineWidth'  : 2,
                    'opacity'    : 1,
                }
            },
            {  '.selected': {
                    'lineWidth'  : 4,
                    'opacity'    : 1,
                }
            },
            {  '.intersected': {
                    'lineWidth'  : 4,
                    'opacity'    : 0.8,
                    'label_visible' : true,
                    'orientation_visible' : true,
                }
            },
            {  '.disabled': {
                    'lineWidth'  : 1,
                    'opacity'    : 0.,
                    'label_visible' : false,
                    'orientation_visible' : false,
                }
            },

        ],

        'node': [

            { '.form': {
                'scale':1,
                'shape': 'prop:shape',
                //'strokeStyle': "gradient:#2244AA", //"get:color", //"#2B51FF", //"#EEEEEE",
                //'fillStyle'  : "gradient:#2244AA", //'get:color',  //#366633',
                
                'image':"prop:image",

                'lineWidth'  : .2,
                'lineJoin'   : 'bevel',
                'lineType' : "dashed",
                'dashSize' : .1,
                'gapSize'  : .5,
                'line_max_length': 11,

                'fontScale'  :  0.07,
                'font' : "normal 10px sans-serif",
                'fontFillStyle'  : '#222',  //#366633',
                //'fontStrokeStyle'  : 'black',
                //'fontStrokeWidth' : 0.6,
                
                'textPaddingY'  : -0.8,
                'textPaddingX'  : 0,
                'textAlign'     : 'center',
                'textVerticalAlign'     : 'center',
            } },


            { '.form.cluster-faded': {
                'opacity'   : 0.3,
            } },
            {'.form.mo-faded': {
                'opacity'   : 0.2,
            } },

            {'.form.sel-faded': {
                'opacity'   : 0.2,
            } },

            {'.form.disabled': {
                'opacity'   : 0.1,
            } },

            {'.form.mo-adjacent': {
                'opacity'   : 1.,
            } },

            {'.form.sel-adjacent': {
                'opacity'   : 1,
            } },

            { '.form.cluster': {
                //'shape': 'square',
                //'scale':1,
                'opacity'   : 1,
                'fontScale'  :  0.12,
            } },

            { '.form.intersected':  {
                'fontScale'  :  0.13,
                'scale':1.2,
                'opacity'   : 1,

            } },

            { '.form.selected':  {
                'strokeStyle'  : '#FFFFFF',
                'scale':1.,
                'opacity'   : 1,
                //'fontScale'  :  0.4,
                'paddingX': 200,
            } },

            { '.target': {
                'shape': 'triangle',
                'lineJoin' : 'bevel',
                'fontScale'  :  0.16,
                'scale':2,
                'textPaddingY'  : 12,

                'font' : "normal 10px sans",
                'fontFillStyle'  : '#111',  //#366633',
                //'fontStrokeStyle'  : null, // '#333',
            } },

            { '.target.intersected': {
            } },

        ]
    };


    return Materials
});
