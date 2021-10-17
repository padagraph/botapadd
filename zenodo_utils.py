from typing import Dict, List
import requests

from botapad.parser import Botapad
from botapi.botapi import BotaIgraph
import igraph
import numpy as np
import csv

API_FILES = "https://zenodo.org/api/records"

class Record:
    __slots__ = ["id", "title", "items"]
    def __init__(self, id, title, items):
        self.id = id
        self.title = title
        self.items = items

    def item_array(self) -> List[Dict]:
        return [{"name":k , "url":f"/zenodo/{self.id}/{k}"} for (k,v) in self.items.items()]

    def __str__(self):
        return f"Record {self.title} with {len(self.items)} items"

def get_record_items(record_id:str) -> Record:
    r = requests.get(API_FILES + "/" + record_id)
    json = r.json()
    title =json["metadata"]["title"]
    items = {item["key"]: item["links"]["self"] for item in r.json()["files"] if item["type"] == "xls"}
    return Record(record_id, title, items)

def get_file_url(record_id, filename) -> str:
    r = get_record_items(record_id)
    return r.items[filename]


def create_pickle():
    bot = BotaIgraph(directed=True)
    pad = Botapad(bot,  "Zenodo", "Zenodo", delete=False, verbose=True, debug=True)
    pad.parse("https://calc.padagraph.io/test-zenodo-composition")
    ig = bot.get_igraph("Zenodo")
    ig.write_pickle("pads/zenodo.pickle")

def build_dicosyn():
    bot = BotaIgraph(directed=True)
    pad = Botapad(bot, "Dicosyn", "Dicosyn", delete=False, verbose=True, debug=True)
    pad.parse("../Olivier/full-dicosyn.csv")
    ig = bot.get_igraph("Dicosyn")
    ig.write_pickle("pads/dicosyn.pickle")

def extract_voc():
    from cello.graphs.prox import prox_markov_dict
    from collections import defaultdict
    import csv
    g_zen = igraph.read("pads/zenodo.pickle")
    g_dico = igraph.read("pads/dicosyn.pickle")
    target_voc = {v['properties']['label'] for v in g_zen.vs if v['nodetype'] == "_Zenodo_tradfr" or v['nodetype'] == "_Zenodo_Sens_Fonction"}
    target_ids = [v.index for v in g_dico.vs if v['properties']['label'] in target_voc]

    with open("/tmp/voclist.txt", "w") as fd:
        fd.write("\n".join(sorted(list(target_voc))))

    results = defaultdict(list)
    with open("/tmp/voc_olivier.csv", "w") as fd:
        writer = csv.writer(fd)
        writer.writerow("source target prox".split())
        for vid in target_ids:
            proxemies = [
                (v, g_dico.vs[i]['properties']['label']) for i, v in prox_markov_dict(g_dico, [vid], length=3, add_loops=True, mode=3).items()
                if i in target_ids
            ]
            source = g_dico.vs[vid]['properties']['label']
            for p, target in sorted(proxemies, reverse=True):
                results[(source, target)].append(p)
        for (s, t), p in results.items():
            writer.writerow([s, t, max(p)])


def find_paths_between_clusters():
    with open("/tmp/chemins.csv","w") as fd:
        writer = csv.writer(fd)
        g = igraph.load("pads/zenodo.pickle")
        g.to_undirected()
        writer.writerow("sens1 sens2 trad1 trad2 famille langue forme".split(" "))
        clusts = [v for v in g.vs if v['nodetype'] == '_Zenodo_clust']
        for i,v in enumerate(clusts):
            clust1 = v['properties']['label']
            for v2 in clusts:
                if v2 != v:
                    clust2 = v2['properties']['label']
                    paths = [p for p in g.get_all_shortest_paths(v, v2) if len(p) ==5]
                    if len(paths) > 0:
                        for p in paths:
                            sens1 = g.vs[p[1]]['properties']['label']
                            lang = g.vs[p[2]]['nodetype']
                            area, lang = lang.split("/",1)
                            area = area[8:]
                            form = g.vs[p[2]]['properties']['label']
                            sens2 = g.vs[p[3]]['properties']['label']
                            print(clust1, clust2, sens1, sens2, area, lang, form)
                            writer.writerow([clust1, clust2, sens1, sens2, area, lang, form])
                        print()


def find_paths_between_clusters_constructions():
    with open("/tmp/chemins_const.csv","w") as fd:
        writer = csv.writer(fd)
        g = igraph.load("pads/zenodo.pickle")
        g.to_undirected()
        writer.writerow("sens1 sens2 trad1 trad2 famille langue forme form2".split(" "))
        clusts = [v for v in g.vs if v['nodetype'] == '_Zenodo_clust']
        for i,v in enumerate(clusts):
            clust1 = v['properties']['label']
            for v2 in clusts:
                if v2 != v:
                    clust2 = v2['properties']['label']
                    paths = [p for p in g.get_all_shortest_paths(v, v2) if len(p) ==6]
                    if len(paths) > 0:
                        for p in paths:
                            sens1 = g.vs[p[1]]['properties']['label']
                            lang = g.vs[p[2]]['nodetype']
                            area, lang = lang.split("/",1)
                            area = area[8:]
                            form = g.vs[p[2]]['properties']['label']
                            form2 = g.vs[p[3]]['properties']['label']
                            sens2 = g.vs[p[4]]['properties']['label']
                            if "~" in form or len(form) < len(form2):
                                print(clust1, clust2, sens1, sens2, area, lang, form, form2)
                                writer.writerow([clust1, clust2, sens1, sens2, area, lang, form, form2])
                        print()

if __name__ == "__main__":
    #print(get_record_items("4542102"))
    #create_pickle()
    #build_dicosyn()
    #extract_voc()
    find_paths_between_clusters_constructions()

