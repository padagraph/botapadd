from pdglib.graphdb_ig import IGraphDB
import re
from marisa_trie import Trie
import igraph as ig
import itertools as it
from botapad.utils import export_graph, prepare_graph, compute_pedigree, graph_stats
from reliure.pipeline import Optionable, Composable

GID = "wikibiographies"

class WikiBioIGDB(IGraphDB):


    def __init__(self, graphs=None, conf=None):
        super().__init__(graphs, conf)
        self.load_wikibios()
        self.build_prefix_trie()


    def load_wikibios(self):
        padurl = "pads/wiki.pickle"
        g = ig.load("./pads/wiki.pickle")
        builder = Composable(prepare_graph) | graph_stats
        graph = builder(GID, g)
        self.set_graph(GID, graph)

    def build_prefix_trie(self):
        g = self.get_graph(GID)
        labels_idx = {k: [x[0] for x in v] for k, v in
                      it.groupby([(n.index, n['properties']['label']) for n in g.vs], key=lambda c: c[1])}
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
        print("wg",what,prefix)
        if(gid == GID):
            return self.fast_complete(gid, prefix, start, size)
        g = self.get_graph(gid)
        m = []
        for v in g.vs:
            if re.search( ".*%s.*" % prefix, v['properties']['label'] , re.IGNORECASE ):
                m.append({
                    "label": v['properties']['label'],
                    "nodetype":v['nodetype'] ,
                    "uuid": v['uuid'],
                 })
        t = len(m)
        m = m[start:size]
        return m


if __name__ == "__main__":
    print("create db")
    gdb = WikiBioIGDB(graphs={})
    print("created")
    print(gdb.fast_complete("wikibios", "John"))

