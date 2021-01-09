from typing import List
from pdglib.graphdb_ig import IGraphDB
import re
from marisa_trie import Trie
import igraph as ig
import itertools as it
from botapad.utils import export_graph, prepare_graph, compute_pedigree, graph_stats
from reliure.pipeline import Optionable, Composable
import pysolr
import csv
#import opencc

#converter = opencc.OpenCC('s2t')


#def convert_and_clean(s: str):
#    return converter.convert(s.rstrip(".,)"))


GID = "wikibiographies"

class WikiBioIGDB(IGraphDB):


    def __init__(self, graphs=None, conf=None):
        super().__init__(graphs, conf)
        #self.load_wikibios()
        #self.build_prefix_trie()
        self.load_silene()

    # todo: create SileneGDB
    def load_silene(self):
        g = ig.load("./pads/silene.pickle")
        builder = Composable(prepare_graph) | graph_stats
        graph = builder("Silene", g)
        self.set_graph("Silene", graph)

    def load_wikibios(self):
        padurl = "pads/wiki.pickle"
        g = ig.load("./pads/wiki.pickle")
        builder = Composable(prepare_graph) | graph_stats
        graph = builder(GID, g)
        self.set_graph(GID, graph)

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

    def complete_silene(self, query, start=0, size=100):
        node_type = "_Silene_Sinogram" if len(query) == 1 else "_Silene_Wordform"
        m = []
        g = self.get_graph("Silene")
        for v in g.vs:
            if v['nodetype'] == node_type and (v['properties']['label'] == query or v['properties']['text'] == query): #.startswith(query):
                m.append({"label": v['properties']['label'], "nodetype": v['nodetype'], 'uuid': v['uuid']})
        return sorted(m, key=lambda x: x['label'])[start:start+size]

    def complete_label(self, gid, what, prefix, start=0, size=100):
        print("wg",what,prefix)
        if(gid == GID):
            return self.fast_complete(gid, prefix, start, size)
        if(gid == 'Silene'):
            return self.complete_silene(prefix, start, size)
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
# /data/Wikibios
def read_NE(id, lang="en", path="/home/pierre/Corpora/WikiBiographies"):
    with open(f"{path}/Biographies_12_08_2020_{lang}/{id}/{id}.csv", newline='') as f:
        reader = csv.DictReader(f, delimiter=';', quoting=csv.QUOTE_NONE)
        for ne in reader:
            if ne['type'] in ["ORG", "PERSON", "GPE","ORGANIZATION", "LOCATION", "PER"]:
                yield {
                    'text': convert_and_clean(ne['entity']),
                    'id_en': ne['id_en'],
                    'id_zh': ne['id_zh']
                }




def query_wikibios_en(q: str):
    solr = pysolr.Solr('http://localhost:8983/solr/wikibio-en', always_commit=True, timeout=10)
    solr.ping()
    q_s = pysolr.sanitize(f"wke_title:({q})^4 wke_content:{q}")
    results = solr.search(q_s, **{'rows':50})
    print(results.hits)
    return {'hits': results.hits,
            'results': [{'title': r['wke_title'][0],
             'id': r['id'],
             'en_id': r.get('wk_en_id',"None"),
             'zh_id': r.get('wk_zh_id',"None"),
             'img': r.get('wk_img'),
             'snippet': r['wke_content'][0][:400],
             'entities': list([x for x in read_NE(r['id'], 'en')])
             } for r in results ]
        }

def get_wikibios_byid_en(ids: List[str]):
    solr = pysolr.Solr('http://localhost:8983/solr/wikibio-en', always_commit=True, timeout=10)
    solr.ping()
    results = []
    for id in ids:
        q_s = pysolr.sanitize(f"id:{id}")
        for r in solr.search(q_s, **{'rows':1}):
            results.append({'title': r['wke_title'][0],
                             'id': r['id'],
                             'en_id': r.get('wk_en_id',"None"),
                             'zh_id': r.get('wk_zh_id',"None"),
                             'img': r.get('wk_img'),
                             'snippet': r['wke_content'][0][:400],
                             'entities': list([x for x in read_NE(r['id'], 'en')])
                             })
    return results



def query_wikibios_zh(q: str):
    solr = pysolr.Solr('http://localhost:8983/solr/wikibio-zh', always_commit=True, timeout=10)
    solr.ping()
    terms = " ".join([f'"{w}"' for w in  q.split()])
    q_s = pysolr.sanitize(f"wkz_title:({terms})^4 wkz_content:{terms}")
    results = solr.search(q_s, **{'rows':50})
    return {'hits': results.hits,
            'results': [{'title': convert_and_clean(r['wkz_title']),
             'id': r['id'],
             'en_id': r.get('wk_en_id', "None"),
             'zh_id': r.get('wk_zh_id', "None"),
             'img': r.get('wk_img'),
             'snippet': converter.convert(r['wkz_content'][:400]),
             'entities': list([x for x in read_NE(r['id'], 'zh')])
             } for r in results ]
            }
def get_wikibios_byid_zh(ids: List[str]):
    solr = pysolr.Solr('http://localhost:8983/solr/wikibio-zh', always_commit=True, timeout=10)
    solr.ping()
    results = []
    for id in ids:
        q_s = pysolr.sanitize(f"id:{id}")
        for r in solr.search(q_s, **{'rows':1}):
            results.append({'title': convert_and_clean(r['wkz_title']),
                 'id': r['id'],
                 'en_id': r.get('wk_en_id', "None"),
                 'zh_id': r.get('wk_zh_id', "None"),
                 'img': r.get('wk_img'),
                 'snippet': converter.convert(r['wkz_content'][:400]),
                 'entities': list([x for x in read_NE(r['id'], 'zh')])
                 })
    return results



if __name__ == "__main__":
    # print("create db")
    # gdb = WikiBioIGDB(graphs={})
    # print("created")
    # print(gdb.fast_complete("wikibios", "周恩來",0,100))
    #print({'results':[page for page in query_wikibios_en("Hanoi Communist France")]})
    print(get_wikibios_byid_zh(["2736", "3409863"]))
