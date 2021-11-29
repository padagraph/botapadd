# -*- coding:utf-8 -*-
from typing import Dict

from reliure.pipeline import Optionable, Composable
from reliure.types import Text, Numeric, Boolean
from reliure.engine import Engine

import igraph


class EngineError(Exception):
    pass


def _prune(graph):
    # pruning
    if graph.vcount() > 1 and graph.ecount() > 1:
        delete = [i for i, v in enumerate(graph.vs)
                  if len(v.neighbors()) == 0]

        graph.delete_vertices(delete)

    return graph


def edge_subgraph(data):
    _format = data['format']
    gid = data['graph']

    if _format == 'index_edgelist':
        nodelist = data['nodelist']
        edgelist = data['edgelist']
        weights = data.get('weights', None)
        directed = data.get('directed', False)

        return egde_list_subgraph(nodelist, edgelist, weights)

    elif _format == 'uuid_edgelist':
        edgelist = data['edgelist']
        weights = data.get('weights', [1 for i in edgelist])
        return uuid_egdelist_subgraph(graphdb, gid, edgelist, weights)


def egde_list_subgraph(node_list, edge_list, weights, directed=False):
    graph = igraph.Graph(directed=directed,
                         graph_attrs={},
                         n=len(node_list),
                         vertex_attrs={'uuid': node_list},
                         edges=edge_list,
                         edge_attrs={'weight': weights})
    return graph


def uuid_egdelist_subgraph(graphdb, gid, edgelist, weights):
    graph = graphdb.get_graph(gid)

    edges = graphdb.get_edges(gid, edgelist)
    nodes = {e["source"] for e in edges}.union({e['target'] for e in edges})
    nodes = {uuid: {} for uuid in nodes}

    graph = to_graph(nodes, edges, weights)
    # print(gid, len(edgelist), len(edges), len(nodes), graph.summary())
    return graph


def nodes_subgraph(graphdb, gid, node_uuids):
    nodes = {n['uuid']: n for n in graphdb.get_nodes(gid, node_uuids)}
    edge_list = graphdb.get_edge_list(gid, node_uuids)
    graph = to_graph(nodes, edge_list)
    return graph


def expand_subgraph(graphdb, gid, uuids, limit=10):
    """
    :param length: extraction array length
    """
    vs = []
    weights = "weight";

    kwargs = {
        'limit': limit,
        'n_step': 3,
        'filter_nodes': None,
        'filter_edges': None
    }

    p = graphdb.proxemie(gid, uuids, **kwargs)
    # todo: construire un objet igraph quivabien
    nodes_uuids =  [n[0] for n in p]
    subgraph_nodes = graphdb.get_nodes(gid, nodes_uuids)
    subgraph_edges = graphdb.get_edge_list(gid, nodes_uuids)
    print(subgraph_nodes)
    print(subgraph_edges)

    return to_graph({n['uuid']:n for n in subgraph_nodes}, subgraph_edges)


def to_graph(nodes: Dict[str,Dict], edge_list, weights=None):
    """ Build a graph from a n4j edge list
    :param edge_list: edle list [( src_uuid, edge_type, edge_properties, tgt_uuid )
    """
    directed = True

    vs_idx = {}
    vs_uuids = []

    es_idx = set()
    es_uuids = []
    edges = []

    for uuid in nodes.keys():
        i_s = vs_idx.get(uuid, -1)
        if i_s < 0:
            i_s = len(vs_uuids)
            vs_uuids.append(uuid)
            vs_idx[uuid] = i_s

    for edge in edge_list:

        src = edge[0]
        tgt = edge[3]
        euuid = edge[2]['uuid']

        # TODO:: raise ERROR
        assert src in nodes
        assert tgt in nodes

        i_s = vs_idx.get(src)
        i_t = vs_idx.get(tgt)

        if directed:
            key = (i_s, i_t)
        else:
            key = (min(i_s, i_t), max(i_s, i_t))

        if euuid not in es_idx:
            es_idx.add(euuid)
            es_uuids.append(euuid)
            edges.append(key)

    graph = igraph.Graph(directed=directed,
                         graph_attrs={},
                         n=len(vs_uuids),
                         vertex_attrs={'uuid': vs_uuids},
                         edges=edges,
                         edge_attrs={'uuid': es_uuids,
                                     'weight': weights if weights else [1 for i in edges]})

    for vertex in graph.vs:
        d = nodes.get(vertex['uuid'], {})
        for k, v in d.items():
            vertex[k] = v

    edges = {e[2]['uuid']: e[2] for e in edge_list}
    for edge in graph.es:
        for k, v in edges[edge['uuid']].items():
            edge[k] = v

    return graph


def starred_engine(graphdb):
    """ Prox engine """
    # setup
    engine = Engine("graph")
    engine.graph.setup(in_name="request", out_name="graph")

    ## Search
    def subgraph(query, limit=200, prune=False):
        """
        :param mode:
        """
        gid = query['graph']
        uuids = graphdb.get_starred_node_uuids(gid)

        if len(uuids) == 0:
            graph = igraph.Graph(directed=True,
                                 graph_attrs={},
                                 n=0,
                                 vertex_attrs={},
                                 edges=[],
                                 edge_attrs={})

        if len(uuids) == 1:
            # FIXME: issue #78
            mode = "prox"
            graph = expand_subgraph(graphdb, gid, uuids, limit=limit)

        elif len(uuids) <= 5:
            mode = "expand"
            graph = expand_subgraph(graphdb, gid, uuids, limit=limit / len(uuids) if len(uuids) else 0.)

        else:
            mode = "nodes"
            uuids = uuids[:limit]
            graph = nodes_subgraph(graphdb, gid, uuids)

        if prune:
            graph = _prune(graph)

        return graph

    graph_search = Optionable("GraphSearch")
    graph_search._func = Composable(subgraph)
    graph_search.add_option("limit", Numeric(vtype=int, default=200))
    graph_search.add_option("prune", Boolean(default=True))

    from cello.graphs.transform import VtxAttr
    graph_search |= VtxAttr(color=[(45, 200, 34), ])
    graph_search |= VtxAttr(type=1)

    engine.graph.set(graph_search)

    return engine


def explore_engine(graphdb):
    """ Prox engine """
    # setup
    engine = Engine("graph")
    engine.graph.setup(in_name="request", out_name="graph")

    ## Search
    def subgraph(query, size=50):
        gid = query['graph']
        uuids = [q for q in query['units']]

        return expand_subgraph(graphdb, gid, uuids, limit=size / len(uuids) if len(uuids) else size)

    graph_search = Optionable("GraphSearchRedis")
    graph_search._func = Composable(subgraph)
    graph_search.add_option("size", Numeric(vtype=int, min=2, default=50))

    from cello.graphs.transform import VtxAttr
    graph_search |= VtxAttr(color=[(45, 200, 34), ])
    graph_search |= VtxAttr(type=1)

    engine.graph.set(graph_search)

    return engine


def expand_prox_engine(graphdb):
    """
    prox with weights and filters on UNodes and UEdges types

    input:  {
                nodes : [ uuid, .. ],  //more complex p0 distribution
                weights: [float, ..], //list of weight
            }
    output: {
                graph : gid,
                scores : [ (uuid_node, score ), .. ]
            }
    """
    engine = Engine("scores")
    engine.scores.setup(in_name="request", out_name="scores")

    ## Search
    def expand(query, step=3, limit=100, filter_nodes=None, filter_edges=None):
        if filter_nodes is None:
            filter_nodes = []
        if filter_edges is None:
            filter_edges = []
        gid = query.get("graph")
        pzeros = query.get("expand", []) + query.get("nodes", [])
        weights = query.get("weights", [])

        return graphdb.proxemie(gid, pzeros, weights, filter_edges=filter_edges, filter_nodes=filter_nodes, limit=limit,
                                n_step=step)

    scores = Optionable("scores")
    scores._func = Composable(expand)
    scores.add_option("step", Numeric(vtype=int, default=3))
    scores.add_option("limit", Numeric(vtype=int, default=50, max=100))
    scores.add_option("filter_nodes", Text(default=set([]), multi=True, uniq=True))
    scores.add_option("filter_edges", Text(default=set([]), multi=True, uniq=True))

    engine.scores.set(expand)

    return engine


def additive_nodes_engine(graphdb):
    """ Additive engine
        add one or more nodes  to the current graph,
        needs to know all node actually in the local graph in order to send edges to the client.
        POST { request : {
                    graph : gid,
                    nodes : [ uuid, uuid, ... ] # current local nodes
                    add   : [ uuid, uuid, ... ] # objects to add to local graph
             }
        will return a subgraphs with all connections between `nodes` and `add`
    """
    # setup
    engine = Engine("graph")
    engine.graph.setup(in_name="request", out_name="graph")

    ## Search
    def subgraph(request):
        gid = request['graph']
        to_add = set(request['add'])
        uuids = set([q for q in request['nodes']] + list(to_add))

        graph = graphdb.get_graph(gid)

        idx = {v['uuid']: v.index for v in graph.vs}
        vs = [idx[e] for e in uuids]
        return graph.subgraph(vs)

    graph_search = Optionable("AdditiveEngine")
    graph_search._func = Composable(subgraph)

    from cello.graphs.transform import VtxAttr
    graph_search |= VtxAttr(color=[(45, 200, 34), ])
    graph_search |= VtxAttr(type=1)

    engine.graph.set(graph_search)

    return engine

