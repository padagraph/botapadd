define([], function() {

    // Backbone constant event

    Constantes =  {

        /* ui request form consts */
        ui_create_nodetype  : "ui_create_nodetype", // 
        ui_edit_nodetype    : "ui_edit_nodetype",   // arg: nodetype
        ui_create_node      : "ui_create_node",     // arg: { nodetype: nodetype model }
        ui_edit_node        : "ui_edit_node",       // arg: vertex
        
        ui_create_edgetype  : "ui_create_edgetype", 
        ui_edit_edgetype    : "ui_edit_edgetype",   // arg: edgetype
        ui_create_edge      : "ui_create_edge",     // arg: { source: vertex, target: vertex, arg: edgetype: edgetype }   }
        ui_edit_edge        : "ui_edit_edge",       // arg: edge model

        /* edge and vertex (un)selection*/
        // unselect all edges | vertices
        unselect_nodes  : "unselect_nodes", 
        unselect_edges  : "unselect_edges",
        
        select_node     : "select_node",  // to select one node, arg:vertex   
        select_edge     : "select_edge" , // to select one edge, arg:edge

        /*  node & and edge remove request */
        remove_all      : "graph_clear", // removes edges and vertices
        remove_node     : "remove_node", // arg: vertex
        remove_edge     : "remove_edge", // arg: edge
        
        
    }
    return Constantes

});


