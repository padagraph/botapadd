from typing import List, Dict, Optional
from pdglib.graphdb_ig import IGraphDB
import re
from marisa_trie import Trie
import igraph as ig
import itertools as it
from botapad.utils import export_graph, prepare_graph, compute_pedigree, graph_stats
from reliure.pipeline import Optionable, Composable
import csv
import opencc
from collections import defaultdict
from  uuid import uuid4

from pdglib.graphdb_interface import GraphExistsError, GraphError, GraphNameError, NodeNotFoundError, EdgeNotFoundError, UserLoginNotFoundError, iGraphDB

import redis
import redisgraph as rg

converter = opencc.OpenCC('s2t')

GID = "JDM"

class TMuseGDB(iGraphDB):

    @staticmethod
    def generate_uuid():
        return uuid4().hex

    def __init__(self, graphs=None, conf=None):
        #super().__init__(graphs, conf)
        #self.load_tmuse_graphs()
        self.trie = None
        self.labels_idx = None
        self.db: Optional[redis.Redis] = None
        #self.build_prefix_trie()

    def create_database(self, **kwargs):
        print("Redis must be running with redisgraph enabled")


    def open_database(self):
        self.db = redis.Redis("localhost", 6379)


    def close_database(self):
        if self.db:
            self.db.close()

    def get_db_metadata(self):
        pass

    def get_graph_metadata(self, gid) :
        """ return meta data for a graph """
        #g = self.get_graph(gid)
        #return  {  k:  f(g[k]) for k in  g.attributes() } if g is not None else
        return {'gid': gid}


    def create_graph(self, user, graph_name, graph_description):
        g = self.get_graph(graph_name)
        info_node = rg.Node(label="InfoNode", properties={
            'name': graph_name,
            'description': graph_description
        })
        g.add_node(info_node)
        g.commit()
        return g

    def destroy_graph(self, graph_name):
        g = self.get_graph(graph_name)
        g.delete()
        g.commit()

    def get_graphs(self):
        raise NotImplementedError
        if not self.db:
            self.open_database()


    def get_graph(self, name):
        if self.db is None:
            self.open_database()
        return rg.Graph(name, self.db)


    def update_graph(self, user, graph, properties):
        g = self.get_graph(graph)
        _ = g.query("""
        MATCH (n:InfoNode)
        SET n += $props
        """, params={'props': properties})
        # todo: check result

    def create_node_type(self, user, gid, name, properties, description=""):
        #g = self.get_graph(gid)
        #n = rg.Node(label="NodeType", properties=properties)
        # add and commit ?
        pass

    def get_node_type(self, uuid):
        pass

    def find_node_type(self, gid, name):
        pass

    def update_nodetype(self, nodetype_id, properties, description):
        pass

    def create_edge_type(self, user, gid, name, properties, description=""):
        pass

    def get_edge_type(self, uuid):
        pass

    def find_edge_type(self, gid, name):
        pass

    def update_edgetype(self, edgetype_id, properties, description):
        pass

    def create_node(self, user, graph, node_type, label, properties):
        """
        create a new node in a graph with a type, a label and a list of properties
        """
        props = {'user': user,
                 'graph': graph,
                 'node_type': node_type
                 }
        props.update({k: v for k, v in properties})
        props['uuid'] = self.generate_uuid()

        g = self.get_graph(graph)
        n = rg.Node(label=node_type, properties=props)
        g.add_node(n)
        g.commit()
        return props['uuid']

    def get_node(self, gid, nid):
        g = self.get_graph(gid)
        query_result = g.query("""
        MATCH (n {uuid:$nid})
        RETURN n LIMIT 1
        """, params={'nid': nid})
        if len(query_result.result_set) == 0:
            return None
        else:
            return query_result.result_set[0][0].properties

    def get_nodes(self, graphname, nids):
        query = """
        MATCH (n) WHERE n.uuid IN $nids
        RETURN n 
        """
        query_result = self.get_graph(graphname).query(query, params={'nids':nids})

        return [{
            'uuid': record[0].properties['uuid'],
            'nodetype': record[0].label,
            'properties':record[0].properties} for record in query_result.result_set]

    def find_nodes(self, gid, nodetype_name, start=0, size=100, **properties):
        pass

    def delete_node(self, nid):
        pass

    def change_node_properties(self, graph, node_uuid, properties):
        g = self.get_graph(graph)
        _ = g.query("""
               MATCH (n) WHERE n.uuid == $node_uuid
               SET n += $props
               """, params={'node_uuid': node_uuid, 'props': properties})
        pass

    def change_edge_properties(self, user, edge_uuid, properties):
        raise NotImplementedError

    def create_edge(self, graph_name, edge_type, label, properties, source, target):
        g = self.get_graph(graph_name)
        source_node = self.get_node(graph_name, source)
        target_node = self.get_node(graph_name, target)
        props = { 'user': '?',
                  'edge_type': edge_type,
                  'label' : label or edge_type
                }
        props.update( { k:v for k,v in properties })
        props['uuid'] = self.generate_uuid()
        edge_node = rg.Edge(source_node, edge_type, target_node, properties=props)
        g.add_edge(edge_node)
        g.commit()

    def find_edges(self, graph_name, edgetype_name, start=0, size=100, **properties):
        pass

    def delete_edge(self, edge_uuid):
        pass

    def get_graph_neighbors(self, gid, node_id, filter_edges=None, filter_nodes=None, filter_properties=None,
                            mode='ALL', start=0, size=100):
        pass

    def batch_create_nodes(self, user, graph_name, data):
        pass

    def batch_create_edges(self, user, graph_name, data):
        pass

    def get_edges(self, graph_name, edges_uuids):
        pass


    def edge_to_pdgdict(self, src:str, edge:rg.Edge, tgt:str) -> Dict:
        return {
            'uuid':edge.properties['uuid'],
            'edgetype': edge.relation,
            'weight': edge.properties.get('weight', 1),
            'properties': edge.properties,
            'source': src,
            'target': tgt
        }

    def get_edge_list(self, graph_name, nodes_uuids):
        g = self.get_graph(graph_name)
        query = """
        MATCH (n1) -[e]-> (n2)
        WHERE n1.uuid IN $uuids AND n2.uuid IN $uuids
        RETURN DISTINCT n1.uuid, e, n2.uuid
        """
        query_result = g.query(query, params={'uuids':nodes_uuids})
        edges = [(row[0], row[1].relation, self.edge_to_pdgdict(row[0],row[1], row[2]), row[2]) for row in query_result.result_set]
        return edges

    def proxemie(self, graph_name, p0, weights=None, filter_edges=None, filter_nodes=None, limit=50, n_step=3):
        g = self.get_graph(graph_name)
        w0 = 1/len(p0)
        active_nodes = {uuid: w0 for uuid in p0}
        neighbors_query = """
        MATCH (n) -[Syn]- (v)
        WHERE n.uuid = $uuid
        RETURN v.uuid
        """
        def one_step(nodes: Dict[int,float]) -> Dict[int, float]:
            next_step = defaultdict(float)
            for src, w in nodes.items():
                neighbors = list(g.query(neighbors_query, params={'uuid':src}).result_set)
                w = w/len(neighbors)
                for tgt in neighbors:
                    next_step[tgt[0]] += w
            print(next_step)
            return next_step
        for _ in range(n_step):
            active_nodes = one_step(active_nodes)
        return list(sorted(active_nodes.items(), key=lambda x:x[1], reverse=True))[:int(limit)]




    def load_tmuse_graphs(self):
        pass
        # for name in graph_names :
        #     g = ig.load(f"./pads/{name}.pickle")
        #     builder = Composable(prepare_graph) | graph_stats
        #     graph = builder(name, g)
        #     self.set_graph(name, graph)

    def build_prefix_trie(self):
        g = self.get_graph(GID)
        labels_idx = {k: [x[0] for x in v] for k, v in
                      it.groupby(sorted([(n.index, n['properties']['label']) for n in g.vs], key=lambda x:x[1]), key=lambda c: c[1])}
        t = Trie(labels_idx.keys())
        idx = {}
        for k, code in t.iteritems():
            idx[code] = labels_idx[k]
        self.trie = t
        self.labels_idx = idx

    def fast_complete(self, gid, prefix, start, size):
        result = []
        g = self.get_graph(GID)
        for k in self.trie.keys(prefix):
            for i in self.labels_idx[self.trie.get(k)]:
                if start > 0:
                    start -= 1
                    continue
                else:
                    size -= 1
                n = g.vs[i]
                result.append({'label': n['properties']['label'], "nodetype": n['nodetype'], 'uuid': n['uuid']})
                if size <= 0:
                    return result
        return result[start:start+size]


    def complete_label(self, gid, what, prefix, start=0, size=100):
        g = self.get_graph(gid)
        query_result = g.query("""
        MATCH (n) WHERE n.label STARTS WITH $pfx
        RETURN n.label, n.nodetype, n.uuid
        """, params={'pfx': prefix})
        m = []
        query_result.pretty_print()
        for n in query_result.result_set:
            m.append({
                "label": n[0],
                "nodetype": n[1],
                "uuid": n[2],
            })
        m = m[start:size]
        return m

