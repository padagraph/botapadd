

import igraph
import datetime
import requests
from collections import Counter

from reliure.pipeline import Optionable, Composable
from botapi import BotaIgraph
from botapad import Botapad

from cello.graphs import pedigree




@Composable
def empty_graph(gid, headers, **kwargs):

    bot = BotaIgraph(directed=True)
    botapad = Botapad(bot , gid, "", delete=False, verbose=True, debug=False)
    botapad.parse_csvrows( headers, separator='auto', debug=False)

    graph = bot.get_igraph(weight_prop="weight")
    graph = prepare_graph(gid, graph)
    graph['starred'] = []
    graph['queries'] = []
    graph['meta'] = {  
            'owner': None,
            'date': None,
            #'date' : datetime.datetime.now().strftime("%Y-%m-%d %Hh%M")
            'node_count': graph.vcount(),
            'edge_count': graph.ecount(),
            'star_count': len( graph['starred'] ),
            'stats' : {}
        }

    return graph


@Composable
def calc2igraph(gid, url, description="", verbose=True, debug=False):
    bot = BotaIgraph(directed=True)
    botapad = Botapad(bot , gid, description, delete=False, verbose=verbose, debug=debug)
    botapad.parse(url, separator='auto', debug=False)
    graph = bot.get_igraph(weight_prop="weight")
    graph['starred'] = []
    graph['queries'] = []
    return graph
    

@Composable
def merge(gid, graph, g, index=None, vid=None, **kwargs):
    """ merge g into graph, returns graph """
    if callable(index):
        idx = index(gid, graph)
    else : idx = index

    if vid == None :
        vid = lambda v : v.index
    
    if None in (gid, graph, g, idx) :
        raise ValueError('One of (gid, graph, g, index)  for graph `%s` is none'  % gid )
    
    nodetypes = [ e['name'] for e in graph['nodetypes'] ]
    for k in g['nodetypes']:
        if k['name'] not in nodetypes:
            graph['nodetypes'].append(k)

    nodetypes = { e['uuid']: e  for e in graph['nodetypes'] }
    for v in g.vs:
        _vid = vid(gid,v)
        if _vid not in idx:
            uuid = "%s" % graph.vcount()
            attrs = v.attributes()
            attrs['uuid'] = uuid

            nodetype = nodetypes[attrs['nodetype']]
            properties = nodetype['properties']
            for k in properties:
                if k not in attrs['properties']:
                    attrs['properties'][k] = properties[k]['default']
            
            graph.add_vertex( **attrs )
            idx[ _vid ] = graph.vs[graph.vcount()-1]
          
                            
    edgetypes = [ e['name'] for e in graph['edgetypes'] ]
    for k in g['edgetypes']:
        if k['name'] not in edgetypes:
            graph['edgetypes'].append(k)

    edgetypes = { e['uuid']: e  for e in graph['edgetypes'] }
    for e in g.es:
        v1, v2 = (vid(gid, g.vs[e.source] ), vid(gid, g.vs[e.target]) )
        #if v1 in idx 
        v1, v2 = ( idx[v1], idx[v2] )
        eid = graph.get_eid( v1, v2 , directed=True, error=False )
        if eid == -1:
            e['uuid'] = graph.ecount()
            attrs = e.attributes()
            edgetype = edgetypes[attrs['edgetype']]
            properties = edgetype['properties']
            for k in properties:
                if k not in attrs['properties']:
                    attrs['properties'][k] = properties[k]['default']
            
            graph.add_edge( v1, v2, **attrs )

    graph['queries'].append(g['query'])
    graph['meta'] = {
            'node_count': graph.vcount(),
            'edge_count': graph.ecount(),
            'star_count': len( graph['starred'] ),
            'owner': None,
            'date': None,
            #'date' : datetime.datetime.now().strftime("%Y-%m-%d %Hh%M")
        }
    graph['meta']['pedigree'] = pedigree.compute(graph)
    graph = graph_stats(graph)    
    return graph


@Composable
def compute_pedigree(graph, **kwargs):
    graph['meta']['pedigree'] = pedigree.compute(graph)
    return graph
    

@Composable
def graph_stats(graph, **kwargs):

    def _types_stats( items , opt={}):
        counter = dict(Counter(items))
        return counter

    graph['meta']['stats'] = {}

    stats = _types_stats(graph.vs['nodetype'])
    for e in graph['nodetypes']:
        e['count'] = stats.get(e['uuid'], 0)
    graph['meta']['stats']['nodetypes'] = stats
    
    stats = _types_stats(graph.es['edgetype'])
    for e in graph['edgetypes']:
        e['count'] = stats.get(e['uuid'], 0)
    graph['meta']['stats']['edgetypes'] = stats

    return graph

    
@Composable
def prepare_graph(gid, graph):

    if not 'starred' in graph.attributes():
        graph['starred'] = []
    if not 'meta' in graph.attributes():
        graph['meta'] = {
            'node_count': graph.vcount(),
            'edge_count': graph.ecount(),
            'owner': "-",
            'star_count': len( graph['starred'] ),
            'upvotes': 0,
            'votes': 0
        }

    if 'properties' not in graph.attributes():    
        graph['properties'] = {}
    
    v_attrs = graph.vs.attribute_names()
    if 'nodetypes' not in graph.attributes():    
        graph['nodetypes'] = [{
          "_uniq_key": "_%s_T" % gid,
          "uuid": "_%s_T" % gid,
          "description": "T", 
          "name": "T", 
          'count': graph.vcount(),
          "properties": {
            k : {
              "choices": None, 
              "default": None, 
              "encoding": "utf8", 
              "help": "", 
              "multi": False, 
              "type": "Text", 
              "uniq": False, 
              "vtype": "unicode"
            }  for k in v_attrs 
          }
        }]
           
    if 'nodetype' not in v_attrs:
        graph.vs['nodetype'] = [ "_%s_T" % gid for e in graph.vs ]
    if 'uuid' not in v_attrs:
        if 'id' in v_attrs: 
            graph.vs['uuid'] = [ "%s" % int(e) for e in graph.vs['id'] ]
        else :
            graph.vs['uuid'] = [ "%s" % e for e in range(len(graph.vs)) ]
    
    if 'properties' not in v_attrs:
        props = [ {  }  for i in range(len(graph.vs))]
        
        for p,v  in zip(props, graph.vs):
            for e in v_attrs:
                if e not in ( 'nodetype', 'uuid', 'properties' )  :
                    p[e] = v[e]
            if 'label' not in v_attrs:
                p['label']  = v.index
                
        graph.vs['properties'] = props
        for k in v_attrs:
            if k not in ( 'nodetype', 'uuid', 'properties' )  :
                del graph.vs[k]
    
    
    e_attrs = graph.es.attribute_names()
    
    
    {"choices": None, "default": None, "encoding": "utf8", "help": "", "multi": False, "type": "Text", "uniq": False, "vtype": "unicode" }
    if 'edgetypes' not in graph.attributes():    
        graph['edgetypes'] = [{ 
            'count': graph.ecount(),
            'description': "E",
            'name': "E",
            'properties': {
                'label': {"choices": None, "default": None, "encoding": "utf8", "help": "",
                          "multi": False, "type": "Text", "uniq": False, "vtype": "unicode" },
                'weight': {"choices": None, "default": None, "encoding": "utf8", "help": "",
                          "multi": False, "type": "Numeric", "uniq": False, "vtype": "float" }
            },
            'type_attributes' : {},
            'uuid' : "_%s_E" % gid,
            '_uniq_key' : "_%s_E" % gid,

    } ]
        
              
    if 'edgetype' not in graph.es.attribute_names():
        graph.es['edgetype'] = [ "_%s_E" % gid for e in graph.es ]
    if 'uuid' not in graph.es.attribute_names():
        graph.es['uuid'] = range(len(graph.es))
    if 'properties' not in graph.es.attribute_names():
        props = [ {  }  for i in range(len(graph.es))]
        attrs = graph.es.attribute_names()
        
        for p,v  in zip(props, graph.es):
            for e in e_attrs:
                if e not in ['edgetype', 'uuid', 'properties' ]:
                    p[e] = v[e]
            if 'label' not in e_attrs:
                p['label']  = v.index
                
        graph.es['properties'] = props
        for k in e_attrs:
            if k not in ( 'edgetype', 'uuid', 'properties', 'weight' )  :
                del graph.es[k]

    if 'weight' not in graph.es.attribute_names():
        graph.es['weight'] = [1. for e in graph.es ]

    return graph


def igraph2dict(graph, exclude_gattrs=[], exclude_vattrs=[], exclude_eattrs=[], id_attribute=None):
    """ Transform a graph (igraph graph) to a dictionary
    to send it to template (or json)
    
    :param graph: the graph to transform
    :type graph: :class:`igraph.Graph`
    :param exclude_gattrs: graph attributes to exclude (TODO)
    :param exclude_vattrs: vertex attributes to exclude (TODO)
    :param exclude_eattrs: edges attributes to exclude (TODO)
    """
    
    # some check
    assert isinstance(graph, igraph.Graph)
    #if 'id' in graph.vs.attributes():
        #raise Warning("The graph already have a vertex attribute 'id'")

    # create the graph dict
    attrs = { k : graph[k] for k in graph.attributes()}
    d = {}
    d['vs'] = []
    d['es'] = []
    
    # attributs of the graph
    if 'nodetypes' in attrs : 
        d['nodetypes']  = attrs.pop('nodetypes')
    if 'edgetypes' in attrs : 
        d['edgetypes']  = attrs.pop('edgetypes')
    
    if 'properties' in attrs:
        d['properties'] = attrs.pop('properties', {})

    if 'meta' in attrs:
        d['meta'] = attrs.pop('meta', {})
        d['meta'].update( {
            'directed' : graph.is_directed(), 
            'bipartite' : 'type' in graph.vs and graph.is_bipartite(),
            'e_attrs' : sorted(graph.es.attribute_names()),
            'v_attrs' : sorted( [ attr for attr in graph.vs.attribute_names() if not attr.startswith('_')])
            })

    # vertices
    v_idx = { }
    for vid, vtx in enumerate(graph.vs):
        vertex = vtx.attributes()
        if id_attribute is not None:
            v_idx[vid] = vertex[id_attribute]
        else:
            v_idx[vid] = vid
            vertex["id"] = vid

        d['vs'].append(vertex)

    # edges
    _getvid = lambda vtxid : v_idx[vtxid] if id_attribute else vtxid 

    for edg in graph.es:
        edge = edg.attributes() # recopie tous les attributs
        edge["source"] = v_idx[edg.source] # match with 'id' vertex attributs
        edge["target"] = v_idx[edg.target]
        #TODO check il n'y a pas de 's' 't' dans attr
        d['es'].append(edge)

    return d
    
@Composable
def export_graph(graph, exclude_gattrs=[], exclude_vattrs=[], exclude_eattrs=[], id_attribute=None):
    return  igraph2dict(graph, exclude_gattrs, exclude_vattrs, exclude_eattrs, id_attribute)    

    
